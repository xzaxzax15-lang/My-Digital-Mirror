import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * درع SSRF: جلب آمن لصفحات عامة موثوقة فقط.
 * - بروتوكول http/https فقط
 * - منع localhost والأسماء الداخلية وعناوين الشبكات الخاصة وعنوان البيانات السحابية
 * - منع إعادة التوجيه (fetch مع redirect: error)
 * - مهلة زمنية وحد لحجم الاستجابة وفحص نوع المحتوى
 * - وضع قائمة سماح للنطاقات عند التحقق من المصادر
 */

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./,
];

function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return PRIVATE_V4.some((re) => re.test(ip));
  if (family === 6) {
    const low = ip.toLowerCase();
    return (
      low === "::1" ||
      low.startsWith("fc") ||
      low.startsWith("fd") ||
      low.startsWith("fe80") ||
      low.startsWith("::ffff:127.") ||
      low.startsWith("::ffff:10.") ||
      low.startsWith("::ffff:192.168.")
    );
  }
  return true; // ليس عنوان IP صالحاً — نتعامل بحذر
}

/** تحقق SSRF مستقل: بروتوكول + مضيف + حل DNS وفحص الخصوصية — يُعاد استخدامه من فاحص الروابط */
export async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("بروتوكول غير مسموح");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".metadata.google.internal")) {
    throw new Error("مضيف داخلي ممنوع");
  }
  // إن كان المضيف IP صريحاً افحصه مباشرة — وإلا فسيُفحص بعد حل DNS
  if (isIP(host) && isPrivateIp(host)) throw new Error("عنوان شبكة داخلية ممنوع");
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0) throw new Error("لا يوجد عنوان للنطاق");
  if (addresses.some((a) => isPrivateIp(a.address))) throw new Error("عنوان شبكة داخلية ممنوع");
  return url;
}

export interface SafeFetchOptions {
  allowedDomains?: string[];
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  text?: string;
  error?: string;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { allowedDomains, timeoutMs = 8000, maxBytes = 1024 * 1024 } = opts;
  const fail = (error: string): SafeFetchResult => ({ ok: false, status: 0, finalUrl: rawUrl, error });

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail("رابط غير صالح");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("بروتوكول غير مسموح");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return fail("مضيف داخلي ممنوع");
  }
  if (host.endsWith(".metadata.google.internal") || host === "metadata.google.internal") {
    return fail("نقطة بيانات سحابية ممنوعة");
  }
  if (allowedDomains && !allowedDomains.includes(host)) {
    return fail("النطاق خارج قائمة المصادر المعتمدة");
  }

  // حل DNS وفحص كل العناوين
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return fail("تعذر حل اسم النطاق");
  }
  if (addresses.length === 0) return fail("لا يوجد عنوان للنطاق");
  if (addresses.some((a) => isPrivateIp(a.address))) {
    return fail("عنوان شبكة داخلية ممنوع");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      redirect: "error", // منع إعادة التوجيه إلى وجهات غير مفحوصة
      signal: controller.signal,
      headers: {
        "User-Agent": "DigitalMirror-SafetyBot/1.0 (resource verification)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|xhtml/i.test(contentType)) {
      return { ok: false, status: res.status, finalUrl: url.toString(), error: "نوع محتوى غير مدعوم" };
    }
    const reader = res.body?.getReader();
    if (!reader) return fail("لا توجد استجابة");
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          break; // نكتفي بأول ميغابايت للتحقق
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
    // استخلاص نص آمن: إزالة الوسوم والمحتويات القابلة للتنفيذ
    const safeText = stripHtml(text).slice(0, 5000);
    return { ok: res.ok, status: res.status, finalUrl: url.toString(), text: safeText };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير معروف";
    if (msg.includes("abort")) return fail("انتهت المهلة الزمنية");
    if (msg.includes("redirect")) return fail("إعادة توجيه ممنوعة");
    return fail("فشل الطلب");
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** إزالة HTML — الصفحات المجلوبة تعامل كبيانات غير موثوقة وليست تعليمات */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
