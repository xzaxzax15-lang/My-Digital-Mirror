import { describe, expect, it } from "vitest";
import { analyzeInput, extractUrls, registrableDomain } from "../shared/linkHeuristics.js";

describe("استخراج النطاق المسجل", () => {
  it("نطاق بسيط", () => {
    expect(registrableDomain("www.example.com")).toBe("example.com");
  });
  it("نطاق دولة من المستوى الثاني مثل com.sa", () => {
    expect(registrableDomain("portal.moi.gov.sa")).toBe("moi.gov.sa");
  });
  it("نطاق فرعي عميق", () => {
    expect(registrableDomain("a.b.c.example.co.uk")).toBe("example.co.uk");
  });
});

describe("استخراج الروابط من النص", () => {
  it("يلتقط الروابط المتعددة", () => {
    const urls = extractUrls("زر https://a.com و http://b.net/path و www.c.org");
    expect(urls.length).toBe(3);
  });
});

describe("تحليل الروابط", () => {
  it("يكشف انتحال العلامات في نطاق غير رسمي", () => {
    const a = analyzeInput("https://google-secure-login.verify-id.net/signin");
    expect(a.riskLevel).toBe("high");
    expect(a.findings.some((f) => f.title.includes("غير رسمي"))).toBe(true);
  });

  it("يكشف عنوان IP كمضيف", () => {
    const a = analyzeInput("http://192.168.1.50/bank/login");
    expect(a.findings.some((f) => f.title.includes("عنوان IP"))).toBe(true);
  });

  it("يكشف الروابط المختصرة", () => {
    const a = analyzeInput("https://bit.ly/3xBankAlert");
    expect(a.findings.some((f) => f.title.includes("مختصر"))).toBe(true);
  });

  it("يكشف بيانات الدخول المدمجة user:pass@", () => {
    const a = analyzeInput("https://google.com:user%40gmail.com@evil.top/login");
    expect(a.findings.some((f) => f.title.includes("مدمجة"))).toBe(true);
  });

  it("يكشف الامتدادات عالية الخطورة", () => {
    const a = analyzeInput("https://win-prize-now.top/claim");
    expect(a.findings.some((f) => f.title.includes("امتداد نطاق عالي الخطورة"))).toBe(true);
  });

  it("يكشف http غير المشفر", () => {
    const a = analyzeInput("http://example.com/page");
    expect(a.findings.some((f) => f.title.includes("غير مشفر"))).toBe(true);
  });

  it("الرابط الرسمي السليم لا ينتج مستوى خطورة مرتفعاً", () => {
    const a = analyzeInput("https://accounts.google.com/signin/recovery");
    expect(a.riskLevel).not.toBe("high");
  });

  it("غياب العلامات لا يعني الأمان — يظهر في إخلاء المسؤولية", () => {
    const a = analyzeInput("https://my-personal-blog.example.dev/post/1");
    expect(a.disclaimer).toContain("لا يعني أن الرابط آمن");
  });
});

describe("تحليل الرسائل", () => {
  it("يكشف أنماط الاحتيال في نص الرسالة", () => {
    const a = analyzeInput("مبروك! فزت بجائزة، ادفع رسوم بسيطة خلال 24 ساعة عبر الرابط لاستلامها");
    expect(a.findings.some((f) => f.title.includes("أنماط احتيال"))).toBe(true);
    expect(a.riskLevel === "high" || a.riskLevel === "medium").toBe(true);
  });

  it("يعلن أن التحليل لا يزور الرابط", () => {
    const a = analyzeInput("http://something.example/");
    expect(a.disclaimer).toContain("دون زيارة الرابط");
  });
});
