import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { loadEnv } from "../server/config.js";
import { createApp } from "../server/app.js";
import { Store } from "../server/db/store.js";

let server: Server;
let baseUrl: string;
let dataDir: string;
let store: Store;

beforeAll(async () => {
  const env = loadEnv();
  dataDir = mkdtempSync(path.join(tmpdir(), "dm-cases-"));
  store = new Store(dataDir);
  store.ensureAdmin(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const app = createApp(env, store);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  store.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* ويندوز قد يبقي مقبض الملف لحظة */
  }
});

const post = (p: string, body: unknown) =>
  fetch(`${baseUrl}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const validReport = {
  incidentType: "sextortion",
  ongoing: true,
  publicationThreat: true,
  minorInvolved: false,
  physicalRisk: false,
  countryCode: "BH",
  consentStore: true,
  summary: "شخص يهدد بنشر صور مقابل مال",
};

describe("الإبلاغ الآمن ونظام القضايا", () => {
  it("ينشئ قضية برقم عشوائي ورمز متابعة، بلا أي بيانات هوية", async () => {
    const r = await post("/api/report", validReport);
    expect(r.status).toBe(201);
    const d = (await r.json()) as { caseNumber: string; followupCode: string };
    expect(d.caseNumber).toMatch(/^MR-[A-Z2-9]{8}$/);
    expect(d.followupCode).toHaveLength(20);
    expect(d.caseNumber).not.toContain("0"); // بلا أحرف ملتبسة
    expect(d.caseNumber).not.toContain("O");
    expect(d.caseNumber).not.toContain("1");
  });

  it("يرفض البلاغ بدون موافقة صريحة على التخزين", async () => {
    const r = await post("/api/report", { ...validReport, consentStore: false });
    expect(r.status).toBe(400);
  });

  it("يرفض دولة غير موجودة في السجل", async () => {
    const r = await post("/api/report", { ...validReport, countryCode: "XX" });
    expect(r.status).toBe(400);
  });

  it("يرفض الوصول برمز خاطئ ولا يكشف وجود القضية", async () => {
    const created = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const r = await post("/api/cases/access", { caseNumber: created.caseNumber, code: "WRONGWRONGWRONG1" });
    expect(r.status).toBe(404);
  });

  it("يفتح القضية بالرمز الصحيح مع السجل والأحداث", async () => {
    const created = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const r = await post("/api/cases/access", { caseNumber: created.caseNumber, code: created.followupCode });
    expect(r.status).toBe(200);
    const d = (await r.json()) as { case: { status: string; severity: string; events: unknown[]; evidence: unknown[] } };
    expect(d.case.status).toBe("NEW");
    expect(d.case.severity).toBe("critical"); // مستمرة + تهديد نشر
    expect(d.case.events.length).toBeGreaterThanOrEqual(1);
    expect(d.case.evidence).toHaveLength(0);
  });

  it("يصنف القضية بطارئة عند وجود قاصر أو خطر جسدي مع حدث تصنيف", async () => {
    const created = (await (
      await post("/api/report", { ...validReport, minorInvolved: true, publicationThreat: false })
    ).json()) as { caseNumber: string; followupCode: string };
    const d = (await (await post("/api/cases/access", { caseNumber: created.caseNumber, code: created.followupCode })).json()) as {
      case: { severity: string; events: { type: string }[] };
    };
    expect(d.case.severity).toBe("critical");
    expect(d.case.events.some((e) => e.type === "triage")).toBe(true);
  });

  it("يضيف دليلاً (بيانات وصفية) ويسجله في سجل الحيازة", async () => {
    const created = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const add = await post("/api/cases/evidence", {
      caseNumber: created.caseNumber,
      code: created.followupCode,
      kind: "message",
      platform: "واتساب",
      occurredAt: "2026-11-01 مساءً",
      description: "رسالة تهديد تطلب مبلغاً",
      sha256: "a".repeat(64),
    });
    expect(add.status).toBe(201);
    const d = (await (await post("/api/cases/access", { caseNumber: created.caseNumber, code: created.followupCode })).json()) as {
      case: { evidence: { description: string; sha256?: string }[]; custodyLog: { action: string }[] };
    };
    expect(d.case.evidence).toHaveLength(1);
    expect(d.case.evidence[0]!.description).toContain("تهديد");
    expect(d.case.evidence[0]!.sha256).toHaveLength(64);
    expect(d.case.custodyLog.some((l) => l.action === "create")).toBe(true);
    expect(d.case.custodyLog.some((l) => l.action === "view")).toBe(true);
  });

  it("يرفض دليلاً ببصمة SHA-256 غير صالحة", async () => {
    const created = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const r = await post("/api/cases/evidence", {
      caseNumber: created.caseNumber,
      code: created.followupCode,
      kind: "url",
      description: "رابط حساب مزيف",
      sha256: "not-a-hash",
    });
    expect(r.status).toBe(400);
  });

  it("يحذف القضية وكل أدلتها نهائياً بطلب صاحبها", async () => {
    const created = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const del = await post("/api/cases/delete", { caseNumber: created.caseNumber, code: created.followupCode });
    expect(del.status).toBe(200);
    const r = await post("/api/cases/access", { caseNumber: created.caseNumber, code: created.followupCode });
    expect(r.status).toBe(404);
  });

  it("لا يسمح بحذف أو ولوج قضية أخرى برمزها (عزل القضايا)", async () => {
    const a = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const b = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    // رمز A لا يفتح قضية B — الرقم مختلف والرمز مرتبط بالقضية
    const r = await post("/api/cases/access", { caseNumber: b.caseNumber, code: a.followupCode });
    expect(r.status).toBe(404);
  });
});

describe("سجل الدول العربية", () => {
  it("يضم 22 دولة عربية", async () => {
    const d = (await (await fetch(`${baseUrl}/api/countries`)).json()) as { countries: { code: string }[] };
    expect(d.countries).toHaveLength(22);
    const codes = new Set(d.countries.map((c) => c.code));
    for (const expected of ["SA", "EG", "MA", "IQ", "SO", "KM", "BH"]) expect(codes.has(expected)).toBe(true);
  });

  it("يعرض تفاصيل دولة — البحرين مفحوصة المصدر بتاريخ", async () => {
    const d = (await (await fetch(`${baseUrl}/api/countries/BH`)).json()) as {
      country: { nameAr: string; cert?: { status: string; verifiedAt?: string } };
    };
    expect(d.country.nameAr).toBe("البحرين");
    expect(d.country.cert?.status).toBe("VERIFIED");
    expect(d.country.cert?.verifiedAt).toBeDefined();
  });

  it("يبقي الدول غير المفحوصة في حالة قيد التحقق — بلا اختراع بيانات", async () => {
    const d = (await (await fetch(`${baseUrl}/api/countries/EG`)).json()) as {
      country: { cert?: { status?: string; name?: string }; cybercrime?: unknown };
    };
    // مصر: لم نتحقق من مصدر رسمي — يجب ألا تُعرض جهة بحالة VERIFIED
    if (d.country.cert) {
      expect(d.country.cert.status).not.toBe("VERIFIED");
      expect(d.country.cert.verifiedAt).toBeUndefined();
    }
    expect(d.country.cybercrime).toBeUndefined();
  });

  it("يرفض دولة غير موجودة", async () => {
    const r = await fetch(`${baseUrl}/api/countries/XX`);
    expect(r.status).toBe(404);
  });
});

describe("مركز الشفافية", () => {
  it("يعرض إحصاءات مجمعة فقط مع إخلاء مسؤولية", async () => {
    const d = (await (await fetch(`${baseUrl}/api/trust`)).json()) as {
      casesTotal: number;
      disclaimer: string;
      activePartnerships: number;
    };
    expect(d.casesTotal).toBeGreaterThanOrEqual(0);
    expect(d.disclaimer).toContain("مجمعة");
    // لا شراكات مدّعاة قبل اتفاق رسمي
    expect(d.activePartnerships).toBe(0);
  });

  it("تعكس أرقام الشفافية القضايا الفعلية وتختفي عند الحذف", async () => {
    const before = (await (await fetch(`${baseUrl}/api/trust`)).json()) as { casesTotal: number };
    const created = (await (await post("/api/report", validReport)).json()) as { caseNumber: string; followupCode: string };
    const during = (await (await fetch(`${baseUrl}/api/trust`)).json()) as { casesTotal: number };
    expect(during.casesTotal).toBe(before.casesTotal + 1);
    await post("/api/cases/delete", { caseNumber: created.caseNumber, code: created.followupCode });
    const after = (await (await fetch(`${baseUrl}/api/trust`)).json()) as { casesTotal: number };
    expect(after.casesTotal).toBe(before.casesTotal);
  });
});
