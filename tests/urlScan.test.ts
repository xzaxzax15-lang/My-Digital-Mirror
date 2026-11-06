import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { vi } from "vitest";
// حل DNS وهمي: النطاقات التجريبية في الاختبارات غير موجودة فعلياً
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
import { loadEnv } from "../server/config.js";
import { createApp } from "../server/app.js";
import { Store } from "../server/db/store.js";

let server: Server;
let baseUrl: string;
let dataDir: string;
let store: Store;

beforeAll(async () => {
  const env = loadEnv();
  dataDir = mkdtempSync(path.join(tmpdir(), "dm-scan-"));
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
    /* ويندوز */
  }
});

// محاكاة خارجيات الفحص: فيد التصيد + RDAP + صفحة الهدف
function stubExternals(opts: {
  feedDomains?: string[];
  rdapRegisteredAt?: string;
  rdapFail?: boolean;
  targetHtml?: string;
  targetRedirect?: string;
  allowPrivateProbe?: boolean;
}) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("phishing.army")) {
        const feed = ["# comment", ...(opts.feedDomains ?? [])].join("\n");
        return new Response(feed, { status: 200 });
      }
      if (url.includes("rdap.org")) {
        if (opts.rdapFail) return new Response("nope", { status: 404 });
        return new Response(
          JSON.stringify({ events: [{ eventAction: "registration", eventDate: opts.rdapRegisteredAt ?? "2020-01-01T00:00:00Z" }] }),
          { status: 200, headers: { "Content-Type": "application/rdap+json" } }
        );
      }
      // الصفحة المستهدفة نفسها (باستثناء الخادم المحلي)
      if (!url.includes("127.0.0.1")) {
        if (opts.targetRedirect) {
          return new Response(null, { status: 302, headers: { Location: opts.targetRedirect } });
        }
        return new Response(opts.targetHtml ?? "<html><title>صفحة عادية</title><body>ok</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return realFetch(input as never, init);
    })
  );
  return () => vi.unstubAllGlobals();
}

const post = (p: string, body: unknown) =>
  fetch(`${baseUrl}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("الفاحص الشامل للروابط", () => {
  let cleanup: () => void;
  afterEach(() => cleanup?.());

  it("نطاق في قاعدة التصيد → حكم danger بدرجة قصوى", async () => {
    cleanup = stubExternals({ feedDomains: ["evil-scan-test.xyz"] });
    const r = await post("/api/tools/scan", { url: "https://evil-scan-test.xyz/login" });
    expect(r.status).toBe(200);
    const d = (await r.json()) as { report: { verdict: string; score: number; checks: { id: string; status: string }[] } };
    expect(d.report.verdict).toBe("danger");
    expect(d.report.score).toBeGreaterThanOrEqual(100);
    const db = d.report.checks.find((c) => c.id === "phishing_db")!;
    expect(db.status).toBe("hit");
  });

  it("نطاق مسجل قبل أسبوع → علامة نطاق حديث جداً", async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    cleanup = stubExternals({ rdapRegisteredAt: weekAgo, feedDomains: [] });
    const r = await post("/api/tools/scan", { url: "https://brand-new-site.com/" });
    const d = (await r.json()) as { report: { domainAgeDays: number; checks: { id: string; status: string; severity?: string }[]; verdict: string } };
    expect(d.report.domainAgeDays).toBeLessThanOrEqual(7);
    const age = d.report.checks.find((c) => c.id === "domain_age")!;
    expect(age.status).toBe("hit");
    expect(age.severity).toBe("high");
  });

  it("صفحة تنتحل علامة معروفة مع حقل كلمة مرور → اكتشاف محتوى عالي", async () => {
    cleanup = stubExternals({
      feedDomains: [],
      targetHtml: `<html><title>تسجيل الدخول - Google</title><body><input type="password"></body></html>`,
    });
    const r = await post("/api/tools/scan", { url: "https://secure-login-verify.top/login" });
    const d = (await r.json()) as { report: { contentFindings: { title: string }[]; score: number } };
    expect(d.report.contentFindings.some((f) => f.title.toLowerCase().includes("google"))).toBe(true);
  });

  it("توجيه لنطاق مختلف → يظهر في سلسلة التوجيه", async () => {
    cleanup = stubExternals({ feedDomains: [], targetRedirect: "https://phish-landing.example.net/step2" });
    const r = await post("/api/tools/scan", { url: "https://innocent-redirect-test.com/" });
    const d = (await r.json()) as { report: { redirectChain?: string[]; checks: { id: string; detail: string }[] } };
    expect(d.report.redirectChain?.length).toBeGreaterThanOrEqual(2);
    const redirects = d.report.checks.find((c) => c.id === "redirects")!;
    expect(redirects.detail).toContain("نطاق مختلف");
  });

  it("VirusTotal بدون مفتاح → حالة disabled صادقة", async () => {
    cleanup = stubExternals({ feedDomains: [] });
    const r = await post("/api/tools/scan", { url: "https://example-clean.com/" });
    const d = (await r.json()) as { report: { checks: { id: string; status: string }[] } };
    const vt = d.report.checks.find((c) => c.id === "virustotal")!;
    expect(vt.status).toBe("disabled");
    expect(vt.detail).toContain("مفتاح");
  });

  it("يرفض مدخلات غير صالحة", async () => {
    const r = await post("/api/tools/scan", { url: "" });
    expect(r.status).toBe(400);
  });

  it("heuristics جديدة: رابط APK ورقم منفذ ونطاق مولد", async () => {
    const { analyzeInput } = await import("../shared/linkHeuristics.js");
    const apk = analyzeInput("https://bank-app-mobile.xyz/download/app.apk");
    expect(apk.findings.some((f) => f.title.includes("APK"))).toBe(true);
    const port = analyzeInput("http://example.com:8081/login");
    expect(port.findings.some((f) => f.title.includes("منفذ"))).toBe(true);
    const msg = analyzeInput("مبروك! وظيفة براتب 5000، سجل الآن وادفع رسوم التأشيرة");
    expect(msg.findings.some((f) => f.title.includes("فئات احتيال"))).toBe(true);
  });
});
