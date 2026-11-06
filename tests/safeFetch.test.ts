import { describe, expect, it } from "vitest";
import { safeFetch, stripHtml } from "../server/safeFetch.js";

describe("درع SSRF — safeFetch", () => {
  it("يرفض البروتوكولات غير http/https", async () => {
    const r = await safeFetch("ftp://example.com/file");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("بروتوكول");
  });

  it("يرفض localhost", async () => {
    const r = await safeFetch("http://localhost:3000/");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("داخلي");
  });

  it("يرفض أسماء المضيفين الداخلية", async () => {
    const r = await safeFetch("http://db.internal:5432/");
    expect(r.ok).toBe(false);
  });

  it("يرفض عنوان بيانات السحابة", async () => {
    const r = await safeFetch("http://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
  });

  it("يرفض العناوين الخاصة عبر حل DNS (192.168.x)", async () => {
    const r = await safeFetch("http://192.168.1.1/");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("داخلية");
  });

  it("يرفض النطاقات خارج قائمة السماح", async () => {
    const r = await safeFetch("https://www.google.com/", { allowedDomains: ["haveibeenpwned.com"] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("قائمة المصادر");
  });

  it("يرفض الروابط غير الصالحة", async () => {
    expect((await safeFetch("ليس-رابطاً")).ok).toBe(false);
    expect((await safeFetch("")).ok).toBe(false);
  });
});

describe("تنظيف HTML", () => {
  it("يزيل الوسوم والسكربتات", () => {
    const html = `<html><script>alert("x")</script><style>.a{}</style><p onclick="steal()">مرحبا</p></html>`;
    expect(stripHtml(html)).toBe("مرحبا");
  });
  it("يفكّ الكيانات الأساسية", () => {
    expect(stripHtml("a &amp; b &lt;c&gt;")).toBe("a & b <c>");
  });
});
