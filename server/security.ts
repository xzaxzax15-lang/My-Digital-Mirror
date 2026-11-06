import type { NextFunction, Request, Response } from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ============================================================
// ترويسات الأمان
// ============================================================
export function securityHeaders(isProd: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        // Vite يحقن أنماطاً داخلية؛ نحصرها في الأنماط دون النصوص
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        // فحص كلمات المرور عبر k-anonymity مباشرة من المتصفح (اختياري ومعلن للمستخدم)
        "connect-src 'self' https://api.pwnedpasswords.com",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ")
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (isProd) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }
    next();
  };
}

// ============================================================
// محدد المعدل — نافذة منزلقة في الذاكرة
// ============================================================
interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: { windowMs: number; max: number; key?: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const id = `${opts.key ?? "global"}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(id) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);
    if (bucket.hits.length >= opts.max) {
      res.status(429).json({
        error: "طلبات كثيرة جداً، انتظر قليلاً ثم أعد المحاولة",
      });
      return;
    }
    bucket.hits.push(now);
    buckets.set(id, bucket);
    // تنظيف دوري بسيط
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.hits.every((t) => now - t > opts.windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}

// ============================================================
// السجلات المنظمة مع إخفاء البيانات الحساسة
// ============================================================
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const SECRET_RE = /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi;

export function redact(input: string): string {
  return input
    .replace(EMAIL_RE, "[بريد مخفي]")
    .replace(CARD_RE, "[أرقام مخفية]")
    .replace(SECRET_RE, "$1=[مخفي]");
}

export function logInfo(msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level: "info", time: new Date().toISOString(), msg, ...data });
  console.log(line);
}

export function logWarn(msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level: "warn", time: new Date().toISOString(), msg, ...data });
  console.warn(line);
}

// ============================================================
// جلسة موقعة (HMAC) — بلا حالة على الخادم
// ============================================================
export interface SessionPayload {
  sub: string;
  role: "admin" | "editor";
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined, secret: string): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "dm_session";
export const CSRF_COOKIE = "dm_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function setSessionCookies(res: Response, sessionToken: string, csrfToken: string, isProd: boolean) {
  const common = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isProd,
    path: "/",
  };
  res.cookie(SESSION_COOKIE, sessionToken, { ...common, maxAge: 8 * 60 * 60 * 1000 });
  // كوكي CSRF قابل للقراءة من جافاسكربت (نمط الإرسال المزدوج) وليس حساساً بطبيعته
  res.cookie(CSRF_COOKIE, csrfToken, { ...common, httpOnly: false, maxAge: 8 * 60 * 60 * 1000 });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

/** وسيط: يتطلب جلسة إدارية صالحة + رمز CSRF للطلبات المغيّرة */
export function requireAdmin(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = verifySession(req.cookies?.[SESSION_COOKIE] as string | undefined, secret);
    if (!session || (session.role !== "admin" && session.role !== "editor")) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const header = req.get(CSRF_HEADER);
      const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
      if (!header || !cookie || header !== cookie) {
        res.status(403).json({ error: "رمز CSRF غير صالح" });
        return;
      }
    }
    (req as Request & { admin?: SessionPayload }).admin = session;
    next();
  };
}

// ============================================================
// كلمات المرور — scrypt
// ============================================================
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  if (candidate.length !== original.length) return false;
  return timingSafeEqual(candidate, original);
}

export function newCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}
