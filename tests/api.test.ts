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
  dataDir = mkdtempSync(path.join(tmpdir(), "dm-test-"));
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
    // ويندوز قد يبقي مقبض الملف لحظة بعد الإغلاق — ترك مجلد مؤقت غير ضار
  }
});

const j = (r: Response) => r.json() as Promise<Record<string, unknown>>;

describe("نقاط النهاية العامة", () => {
  it("فحص الصحة", async () => {
    const r = await fetch(`${baseUrl}/api/health`);
    expect(r.status).toBe(200);
    expect((await j(r)).ok).toBe(true);
  });

  it("المساعد يوجه المواضيع الخارجة بأدب", async () => {
    const r = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "كيف أطبخ كبسة؟" }],
        state: {},
      }),
    });
    const data = (await j(r)) as { reply: { scopeRedirect?: boolean } };
    expect(data.reply.scopeRedirect).toBe(true);
  });

  it("المساعد يسأل توضيحات ثم يسلّم خطة", async () => {
    const step1 = (await j(
      await fetch(`${baseUrl}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "بريدي جيميل اخترق" }], state: {} }),
      })
    )) as { reply: { questions?: string[] }; state: Record<string, unknown> };

    expect(step1.reply.questions).toBeDefined();

    const step2 = (await j(
      await fetch(`${baseUrl}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: "بريدي جيميل اخترق" },
            { role: "assistant", content: step1.reply.content },
            { role: "user", content: "ما أقدر أدخل، فقدت الوصول" },
          ],
          state: step1.state,
        }),
      })
    )) as { reply: { plan?: { title: string } } };
    expect(step2.reply.plan).toBeDefined();
  });

  it("يرفض جسم المساعد غير الصالح", async () => {
    const r = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(r.status).toBe(400);
  });

  it("الدروس: 13 درساً منظماً", async () => {
    const data = (await j(await fetch(`${baseUrl}/api/lessons`))) as { lessons: unknown[] };
    expect(data.lessons.length).toBe(13);
  });

  it("درس مفرد بالاختبار", async () => {
    const data = (await j(await fetch(`${baseUrl}/api/lessons/phishing-detection`))) as {
      lesson: { quiz: unknown[]; checklist: unknown[] };
    };
    expect(data.lesson.quiz.length).toBeGreaterThanOrEqual(2);
    expect(data.lesson.checklist.length).toBeGreaterThanOrEqual(3);
  });

  it("الموارد تشمل المتحقق منها وغير المتحقق بوسم صادق", async () => {
    const data = (await j(await fetch(`${baseUrl}/api/resources`))) as {
      resources: { status: string; verifiedAt?: string }[];
    };
    expect(data.resources.length).toBeGreaterThanOrEqual(20);
    const verified = data.resources.filter((r) => r.status === "verified");
    expect(verified.length).toBeGreaterThanOrEqual(1);
    expect(verified[0]!.verifiedAt).toBeDefined();
  });

  it("فحص التسريبات بدون مفتاح يظهر «غير متاحة» بصدق — لا نتائج وهمية", async () => {
    const hash = "A9993E364706816ABA3E25717850C26C9CD0D89D"; // SHA-1("abc")
    const data = (await j(
      await fetch(`${baseUrl}/api/tools/breach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailHash: hash }),
      })
    )) as { result: { status: string; breaches: unknown[] } };
    expect(data.result.status).toBe("unavailable");
    expect(data.result.breaches.length).toBe(0);
  });

  it("يرفض بصمة غير صالحة لفحص التسريبات", async () => {
    const r = await fetch(`${baseUrl}/api/tools/breach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailHash: "not-a-hash" }),
    });
    expect(r.status).toBe(400);
  });

  it("تحليل الروابط عبر API", async () => {
    const data = (await j(
      await fetch(`${baseUrl}/api/tools/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "https://bit.ly/x-prize" }),
      })
    )) as { analysis: { riskLevel: string } };
    expect(["medium", "high"]).toContain(data.analysis.riskLevel);
  });
});

describe("حماية الإدارة", () => {
  it("يرفض الدخول الخاطئ", async () => {
    const r = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    });
    expect(r.status).toBe(401);
  });

  it("overview محمية بدون جلسة", async () => {
    const r = await fetch(`${baseUrl}/api/admin/overview`);
    expect(r.status).toBe(401);
  });

  it("تدفق الإدارة: دخول → نظرة عامة → تغيير حالة يتطلب CSRF", async () => {
    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "test-pass-123" }),
    });
    expect(login.status).toBe(200);
    const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const csrf = (await (j(login) as Promise<{ csrfToken: string }>)).csrfToken;

    const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: cookies } });
    expect(overview.status).toBe(200);

    // بدون رمز CSRF → مرفوض
    const noCsrf = await fetch(`${baseUrl}/api/admin/content-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookies },
      body: JSON.stringify({ entityType: "lesson", entityId: "phishing-detection", status: "hidden" }),
    });
    expect(noCsrf.status).toBe(403);

    // مع الرمز → نجاح + يختفي الدرس من الواجهة العامة
    const withCsrf = await fetch(`${baseUrl}/api/admin/content-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookies, "x-csrf-token": csrf },
      body: JSON.stringify({ entityType: "lesson", entityId: "phishing-detection", status: "hidden" }),
    });
    expect(withCsrf.status).toBe(200);
    const lessons = (await j(await fetch(`${baseUrl}/api/lessons`))) as { lessons: { id: string }[] };
    expect(lessons.lessons.find((l) => l.id === "phishing-detection")).toBeUndefined();

    // إعادته للنشر
    await fetch(`${baseUrl}/api/admin/content-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookies, "x-csrf-token": csrf },
      body: JSON.stringify({ entityType: "lesson", entityId: "phishing-detection", status: "published" }),
    });
    const lessons2 = (await j(await fetch(`${baseUrl}/api/lessons`))) as { lessons: { id: string }[] };
    expect(lessons2.lessons.find((l) => l.id === "phishing-detection")).toBeDefined();
  });

  it("سجل التدقيق يسجل الإجراءات", async () => {
    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "test-pass-123" }),
    });
    const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const data = (await j(
      await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: cookies } })
    )) as { audit: { action: string }[] };
    expect(data.audit.some((a) => a.action.startsWith("status:"))).toBe(true);
  });
});

describe("تحديد المعدل", () => {
  it("فحص التسريبات محدود بثلاث محاولات لكل خمس دقائق", async () => {
    const hash = "A9993E364706816ABA3E25717850C26C9CD0D89D";
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${baseUrl}/api/tools/breach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailHash: hash }),
      });
      lastStatus = r.status;
    }
    expect(lastStatus).toBe(429);
  });
});
