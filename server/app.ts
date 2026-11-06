import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { Env } from "./config.js";
import {
  clearSessionCookies,
  CSRF_COOKIE,
  hashPassword,
  logInfo,
  logWarn,
  newCsrfToken,
  rateLimit,
  requireAdmin,
  securityHeaders,
  SESSION_COOKIE,
  setSessionCookies,
  signSession,
  verifyPassword,
  verifySession,
} from "./security.js";
import { countries, getCountry } from "../shared/content/countries.js";
import { safeFetch } from "./safeFetch.js";
import { askChatAdvisor, askChatAdvisorStream, sanitizeHistory } from "./services/aiChat.js";
import { runUrlScan } from "./services/urlScan.js";
import { Store } from "./db/store.js";
import { respond as engineRespond } from "./services/assistant.js";
import { enhanceMessage } from "./services/ai.js";
import { checkBreaches } from "./services/breach.js";
import { lessonsPartA } from "../shared/content/lessons-a.js";
import { lessonsPartB } from "../shared/content/lessons-b.js";
import { officialResources } from "../shared/content/resources.js";
import { videoLibrary } from "../shared/content/videos.js";
import { allPlaybooks } from "../shared/content/playbooks-index.js";
import { analyzeInput } from "../shared/linkHeuristics.js";
import type { AssistantState, ChatMessage, Lesson, OfficialResource, VideoItem } from "../shared/types.js";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

// ============================================================
// تحليل الكوكيز بدون اعتماديات
// ============================================================
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

const cookieParser = (req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { cookies?: Record<string, string> }).cookies = parseCookies(req.headers.cookie);
  next();
};

// ============================================================
// مخططات التحقق من المدخلات
// ============================================================
const AssistantBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
  state: z
    .object({
      incidentType: z.string().optional(),
      urgency: z.enum(["critical", "high", "medium", "low"]).optional(),
      controlStatus: z.enum(["has_control", "lost_control", "unknown"]).optional(),
      askedClarifications: z.boolean().optional(),
      deliveredPlan: z.boolean().optional(),
    })
    .default({ urgency: "low", askedClarifications: false, deliveredPlan: false }),
});

const BreachBody = z.object({
  emailHash: z.string().regex(/^[A-Fa-f0-9]{40}$/, "بصمة غير صالحة"),
});

const AnalyzeBody = z.object({ input: z.string().min(1).max(2000) });

const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

const StatusBody = z.object({
  entityType: z.enum(["lesson", "video", "resource", "playbook"]),
  entityId: z.string().min(1).max(64),
  status: z.enum(["published", "hidden", "pending"]),
});

const AddResourceBody = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(500),
  url: z.string().url().max(500),
  kind: z.enum(["account_recovery", "abuse_report", "cert", "consumer", "cybercrime", "education"]),
  countryCode: z.string().max(2).optional(),
  countryName: z.string().max(60).optional(),
  incidentTypes: z.array(z.string().max(64)).max(10).default([]),
  publish: z.boolean().default(false),
});

const VerifyResourceBody = z.object({
  id: z.string().min(1).max(64),
  url: z.string().url().max(500).optional(),
});

const AddVideoBody = z.object({
  title: z.string().min(3).max(160),
  url: z.string().url().max(500),
  source: z.string().min(2).max(120),
  topic: z.string().max(80).default(""),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  publish: z.boolean().default(false),
});

// ---------- قضايا حماية الضحايا ----------
const ReportBody = z.object({
  incidentType: z.string().min(1).max(64),
  ongoing: z.boolean(),
  publicationThreat: z.boolean(),
  minorInvolved: z.boolean(),
  physicalRisk: z.boolean(),
  countryCode: z.string().length(2).optional(),
  consentStore: z.literal(true), // لا تُنشأ قضية دون موافقة صريحة على التخزين
  summary: z.string().max(500).optional(),
});

const CaseAccessBody = z.object({
  caseNumber: z.string().regex(/^MR-[A-Z2-9]{8}$/, "رقم قضية غير صالح"),
  code: z.string().min(12).max(32),
});

const EvidenceBody = CaseAccessBody.extend({
  kind: z.enum(["message", "account", "url", "payment", "other"]),
  platform: z.string().max(60).optional(),
  occurredAt: z.string().max(40).optional(),
  timezone: z.string().max(60).optional(),
  description: z.string().min(3).max(800),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
});

const CASE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // بلا أحرف ملتبسة

function newCaseNumber(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += CASE_ALPHABET[bytes[i]! % CASE_ALPHABET.length];
  return `MR-${s}`;
}

function newFollowupCode(): string {
  const bytes = randomBytes(20);
  let s = "";
  for (let i = 0; i < 20; i++) s += CASE_ALPHABET[bytes[i]! % CASE_ALPHABET.length];
  return s;
}

function caseSeverity(c: { ongoing: number; minor_involved: number; physical_risk: number; publication_threat: number }): "critical" | "high" | "medium" {
  if (c.physical_risk || c.minor_involved) return "critical";
  if (c.ongoing && c.publication_threat) return "critical";
  if (c.ongoing || c.publication_threat) return "high";
  return "medium";
}

const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: "جديدة",
  TRIAGED: "مصنفة",
  AWAITING_CONSENT: "بانتظار موافقتك",
  REFERRED: "أُحيلت لجهة",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تمت المعالجة",
  CLOSED: "مغلقة",
};

// ---------- المستشار الذكي (حوار التوعية) ----------
// حد 4000 للردود الطويلة الواردة في التاريخ — sanitizeHistory يقصمها لاحقاً إلى 2000
const AiChatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(12),
});

// ============================================================
// بناء التطبيق
// ============================================================
export function createApp(env: Env, store: Store) {
  // حدود الإنتاج تبقى كما هي؛ في بيئة الاختبار فقط تُضاعف لتسمح بسيناريوهات متعددة من نفس العنوان
  const rl = (n: number) => (env.NODE_ENV === "test" ? n * 100 : n);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "120kb" }));
  app.use(cookieParser);
  app.use(securityHeaders(env.isProd));

  const adminGuard = requireAdmin(env.SESSION_SECRET);

  // ---------- الصحة ----------
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), name: "digital-mirror" });
  });

  // ---------- المساعد ----------
  app.post(
    "/api/assistant",
    rateLimit({ windowMs: 60_000, max: 20, key: "assistant" }),
    async (req, res) => {
      const parsed = AssistantBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "طلب غير صالح" });
        return;
      }
      const started = Date.now();
      const { messages, state } = parsed.data;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const result = engineRespond(messages as ChatMessage[], state as AssistantState);

      // تحسين اختياري بالذكاء الاصطناعي — الخطة المنظمة تبقى من المحرك الحتمي
      if (result.reply.plan && env.AI_PROVIDER !== "none" && lastUser) {
        const historyBrief = messages.slice(-6).map((m) => `${m.role === "user" ? "مستخدم" : "مساعد"}: ${m.content.slice(0, 150)}`).join(" | ");
        const enhanced = await enhanceMessage(env, {
          userMessage: lastUser.content,
          plan: result.reply.plan,
          historyBrief,
        });
        if (enhanced) result.reply.content = enhanced;
      }

      logInfo("assistant_reply", {
        incidentType: result.state.incidentType ?? null,
        urgency: result.state.urgency,
        hasPlan: Boolean(result.reply.plan),
        ms: Date.now() - started,
      });
      res.json({ reply: result.reply, state: result.state });
    }
  );

  // ---------- المحتوى العام ----------
  const mergeContent = () => {
    const statuses = store.statusMap();
    const verifications = store.resourceVerifications();

    const lessons: Lesson[] = [...lessonsPartA, ...lessonsPartB]
      .sort((a, b) => a.order - b.order)
      .filter((l) => (statuses.get(`lesson:${l.id}`) ?? "published") === "published");

    const videos: VideoItem[] = [
      ...videoLibrary.filter((v) => (statuses.get(`video:${v.id}`) ?? "published") === "published"),
      ...(store.customVideos() as {
        id: number;
        title: string;
        url: string;
        source: string;
        topic: string;
        difficulty: string;
        status: string;
        verified_at: string | null;
      }[]).map((v) => ({
        id: `custom-${v.id}`,
        title: v.title,
        source: v.source,
        url: v.url,
        durationMinutes: undefined,
        difficulty: (["beginner", "intermediate", "advanced"].includes(v.difficulty) ? v.difficulty : "beginner") as VideoItem["difficulty"],
        topic: v.topic,
        captionsAr: false,
        status: v.status === "published" ? ("published" as const) : ("pending_review" as const),
        verifiedAt: v.verified_at ?? undefined,
      })),
    ];

    const resources: OfficialResource[] = officialResources
      .filter((r) => (statuses.get(`resource:${r.id}`) ?? "published") === "published")
      .map((r) => {
        const v = verifications.get(r.id);
        if (!v) return r;
        return { ...r, status: "verified" as const, verifiedAt: v.verifiedAt };
      });

    return { lessons, videos, resources };
  };

  app.get("/api/lessons", (_req, res) => {
    res.json({ lessons: mergeContent().lessons.map((l) => ({ ...l })) });
  });

  app.get("/api/lessons/:id", (req, res) => {
    const lesson = mergeContent().lessons.find((l) => l.id === req.params.id);
    if (!lesson) {
      res.status(404).json({ error: "الدرس غير موجود" });
      return;
    }
    res.json({ lesson });
  });

  app.get("/api/videos", (_req, res) => {
    res.json({ videos: mergeContent().videos });
  });

  app.get("/api/resources", (_req, res) => {
    const { resources } = mergeContent();
    const custom = store.customResources() as {
      id: number;
      title: string;
      description: string;
      url: string;
      kind: string;
      country_code: string | null;
      country_name: string | null;
      incident_types: string;
      status: string;
      verified_at: string | null;
    }[];
    const customMapped: OfficialResource[] = custom
      .filter((r) => r.status === "published")
      .map((r) => ({
        id: `custom-${r.id}`,
        title: r.title,
        description: r.description,
        url: r.url,
        kind: r.kind as OfficialResource["kind"],
        countryCode: r.country_code ?? undefined,
        countryName: r.country_name ?? undefined,
        platforms: [],
        incidentTypes: JSON.parse(r.incident_types || "[]") as string[],
        status: r.verified_at ? "verified" : "unverified",
        verifiedAt: r.verified_at ?? undefined,
      }));
    res.json({ resources: [...resources, ...customMapped] });
  });

  app.get("/api/playbooks", (_req, res) => {
    // فهرس الأدلة للعرض العام — بدون الحاجة للتفاصيل الكاملة
    res.json({
      playbooks: allPlaybooks.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        defaultUrgency: p.defaultUrgency,
      })),
    });
  });

  // ---------- الأدوات ----------
  app.post(
    "/api/tools/analyze",
    rateLimit({ windowMs: 60_000, max: 30, key: "analyze" }),
    (req, res) => {
      const parsed = AnalyzeBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "مدخل غير صالح" });
        return;
      }
      res.json({ analysis: analyzeInput(parsed.data.input) });
    }
  );

  // الفاحص الشامل: محلي + قاعدة تصيد + عمر النطاق + فحص محتوى حي (10 فحوص/5 دقائق — نداءات خارجية ثقيلة)
  app.post(
    "/api/tools/scan",
    rateLimit({ windowMs: 5 * 60_000, max: rl(10), key: "scan" }),
    async (req, res) => {
      const parsed = z.object({ url: z.string().min(4).max(2000) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "أدخل رابطاً صالحاً" });
        return;
      }
      try {
        const report = await runUrlScan(env, parsed.data.url.trim());
        logInfo("url_scan", { verdict: report.verdict, score: report.score });
        res.json({ report });
      } catch (e) {
        logWarn("url_scan_failed", {});
        res.status(400).json({ error: e instanceof Error ? e.message : "تعذر الفحص — تأكد من صيغة الرابط" });
      }
    }
  );

  app.post(
    "/api/tools/breach",
    rateLimit({ windowMs: 5 * 60_000, max: 3, key: "breach" }),
    async (req, res) => {
      const parsed = BreachBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "طلب غير صالح" });
        return;
      }
      // لا تسجيل للبصمة ولا لأي مشتق منها
      const result = await checkBreaches(env.HIBP_API_KEY, parsed.data.emailHash.toUpperCase());
      res.json({ result });
    }
  );

  // ---------- الإدارة ----------
  app.post(
    "/api/admin/login",
    rateLimit({ windowMs: 15 * 60_000, max: 10, key: "admin-login" }),
    (req, res) => {
      const parsed = LoginBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "طلب غير صالح" });
        return;
      }
      const admin = store.getAdmin(parsed.data.username);
      if (!admin || !verifyPassword(parsed.data.password, admin.password_hash)) {
        logWarn("admin_login_failed", { usernameLength: parsed.data.username.length });
        res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        return;
      }
      const token = signSession(
        { sub: admin.username, role: admin.role, exp: Date.now() + 8 * 60 * 60 * 1000 },
        env.SESSION_SECRET
      );
      const csrf = newCsrfToken();
      setSessionCookies(res, token, csrf, env.isProd);
      store.audit(admin.username, "login", "session", admin.username);
      res.json({ ok: true, username: admin.username, role: admin.role, csrfToken: csrf });
    }
  );

  app.post("/api/admin/logout", (req, res) => {
    const session = verifySession(req.cookies?.[SESSION_COOKIE] as string | undefined, env.SESSION_SECRET);
    if (session) store.audit(session.sub, "logout", "session", session.sub);
    clearSessionCookies(res);
    res.json({ ok: true });
  });

  app.get("/api/admin/me", (req, res) => {
    const session = verifySession(req.cookies?.[SESSION_COOKIE] as string | undefined, env.SESSION_SECRET);
    if (!session) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    res.json({ username: session.sub, role: session.role });
  });

  app.get("/api/admin/overview", adminGuard, (_req, res) => {
    const statuses = store.statusMap();
    res.json({
      lessons: [...lessonsPartA, ...lessonsPartB].map((l) => ({
        id: l.id,
        title: l.title,
        track: l.track,
        status: statuses.get(`lesson:${l.id}`) ?? "published",
      })),
      videos: store.customVideos(),
      coreVideos: videoLibrary.map((v) => ({ id: v.id, title: v.title, status: statuses.get(`video:${v.id}`) ?? "published" })),
      resources: officialResources.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        status: statuses.get(`resource:${r.id}`) ?? "published",
        verification: r.status === "verified" ? "seed-verified" : "pending",
      })),
      customResources: store.customResources(),
      playbooks: allPlaybooks.map((p) => ({ id: p.id, title: p.title, category: p.category })),
      caseStats: store.caseStats(),
      audit: store.listAudit(50),
    });
  });

  app.post("/api/admin/content-status", adminGuard, (req, res) => {
    const parsed = StatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "طلب غير صالح" });
      return;
    }
    const admin = (req as Request & { admin?: { sub: string; role: string } }).admin!;
    store.setStatus(parsed.data.entityType, parsed.data.entityId, parsed.data.status, admin.sub);
    store.audit(admin.sub, `status:${parsed.data.status}`, parsed.data.entityType, parsed.data.entityId);
    res.json({ ok: true });
  });

  app.post("/api/admin/resources", adminGuard, (req, res) => {
    const parsed = AddResourceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "بيانات المورد غير مكتملة أو غير صالحة" });
      return;
    }
    const admin = (req as Request & { admin?: { sub: string } }).admin!;
    const id = store.addCustomResource({
      ...parsed.data,
      status: parsed.data.publish ? "published" : "pending",
      createdBy: admin.sub,
    });
    store.audit(admin.sub, "resource:add", "resource", String(id));
    res.json({ ok: true, id: `custom-${id}` });
  });

  app.post("/api/admin/resources/verify", adminGuard, async (req, res) => {
    const parsed = VerifyResourceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "طلب غير صالح" });
      return;
    }
    const admin = (req as Request & { admin?: { sub: string } }).admin!;
    const { id } = parsed.data;

    let url = parsed.data.url;
    if (!url) {
      const core = officialResources.find((r) => r.id === id);
      url = core?.url ?? (id.startsWith("custom-") ? store.customResourceUrl(Number(id.slice(7))) : undefined);
    }
    if (!url) {
      res.status(404).json({ error: "لم يُعثر على المورد" });
      return;
    }

    const result = await safeFetch(url, { timeoutMs: 8000 });
    if (!result.ok) {
      res.json({
        ok: false,
        message: `تعذر التحقق: ${result.error ?? `استجابة HTTP ${result.status}`}. يبقى المورد دون تحديث حالة.`,
        status: result.status,
      });
      return;
    }
    const verifiedAt = store.setResourceVerification(id, admin.sub, result.status);
    store.audit(admin.sub, "resource:verify", "resource", id);
    res.json({ ok: true, verifiedAt, httpStatus: result.status, title: result.text?.slice(0, 120) });
  });

  app.post("/api/admin/videos", adminGuard, (req, res) => {
    const parsed = AddVideoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "بيانات الفيديو غير مكتملة أو غير صالحة" });
      return;
    }
    const admin = (req as Request & { admin?: { sub: string } }).admin!;
    const id = store.addCustomVideo({
      ...parsed.data,
      status: parsed.data.publish ? "published" : "pending",
      createdBy: admin.sub,
    });
    store.audit(admin.sub, "video:add", "video", String(id));
    res.json({ ok: true, id: `custom-${id}` });
  });

  // ---------- قضايا حماية الضحايا ----------

  app.post(
    "/api/report",
    rateLimit({ windowMs: 60 * 60_000, max: rl(5), key: "report" }),
    (req, res) => {
      const parsed = ReportBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "بيانات البلاغ ناقصة أو غير صالحة" });
        return;
      }
      const d = parsed.data;
      if (d.countryCode && !getCountry(d.countryCode)) {
        res.status(400).json({ error: "الدولة غير معروفة" });
        return;
      }
      const caseNumber = newCaseNumber();
      const followupCode = newFollowupCode();
      // رمز المتابعة يُخزَّن مجزّأاً فقط (scrypt) — لا يمكن استعادته إن فُقد
      store.createCase({
        caseNumber,
        followupHash: hashPassword(followupCode),
        incidentType: d.incidentType,
        ongoing: d.ongoing,
        minorInvolved: d.minorInvolved,
        physicalRisk: d.physicalRisk,
        publicationThreat: d.publicationThreat,
        countryCode: d.countryCode,
        consentJson: JSON.stringify({ store: true, at: new Date().toISOString() }),
        summary: d.summary,
      });
      if (d.minorInvolved || d.physicalRisk) {
        store.addCaseEvent(caseNumber, "triage", "تصنيف أولي: أولوية طارئة — تُوجَّه الضحية لقنوات الطوارئ الفورية");
      }
      logInfo("case_created", { severity: caseSeverity({ ongoing: d.ongoing ? 1 : 0, minor_involved: d.minorInvolved ? 1 : 0, physical_risk: d.physicalRisk ? 1 : 0, publication_threat: d.publicationThreat ? 1 : 0 }) });
      res.status(201).json({ caseNumber, followupCode });
    }
  );

  app.post(
    "/api/cases/access",
    rateLimit({ windowMs: 15 * 60_000, max: rl(20), key: "case-access" }),
    (req, res) => {
      const parsed = CaseAccessBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "بيانات الوصول غير صالحة" });
        return;
      }
      const { caseNumber, code } = parsed.data;
      const c = store.getCaseByNumber(caseNumber);
      if (!c || !verifyPassword(code, c.followup_hash)) {
        logWarn("case_access_denied", {});
        res.status(404).json({ error: "لا توجد قضية بهذا الرمز — تأكد من رقم القضية ورمز المتابعة" });
        return;
      }
      const events = store.listCaseEvents(caseNumber);
      const evidence = store.listEvidence(caseNumber);
      store.logEvidenceAccess(evidence.map((e) => e.id), "victim-access");
      const pb = allPlaybooks.find((p) => p.id === c.incident_type);
      res.json({
        case: {
          caseNumber: c.case_number,
          status: c.status as import("../shared/types.js").CaseStatus,
          statusLabel: CASE_STATUS_LABELS[c.status] ?? c.status,
          severity: caseSeverity(c),
          incidentType: c.incident_type,
          incidentTitle: pb?.title ?? "حادثة أخرى",
          ongoing: Boolean(c.ongoing),
          minorInvolved: Boolean(c.minor_involved),
          physicalRisk: Boolean(c.physical_risk),
          publicationThreat: Boolean(c.publication_threat),
          countryCode: c.country_code ?? undefined,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          summary: c.summary ?? undefined,
          events: events.map((e) => ({ type: e.event_type, note: e.note ?? "", at: e.created_at })),
          evidence: evidence.map((e) => ({
            id: e.id,
            kind: e.kind as import("../shared/types.js").EvidenceKind,
            platform: e.platform ?? undefined,
            occurredAt: e.occurred_at ?? undefined,
            timezone: e.timezone ?? undefined,
            description: e.description,
            sha256: e.sha256 ?? undefined,
            createdAt: e.created_at,
          })),
          custodyLog: store.listEvidenceLog(caseNumber).map((l) => ({
            action: l.action,
            actor: l.actor,
            at: l.created_at,
          })),
        } satisfies import("../shared/types.js").CaseView,
      });
    }
  );

  app.post(
    "/api/cases/evidence",
    rateLimit({ windowMs: 60 * 60_000, max: rl(60), key: "case-evidence" }),
    (req, res) => {
      const parsed = EvidenceBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "بيانات الدليل غير صالحة" });
        return;
      }
      const { caseNumber, code, ...entry } = parsed.data;
      const c = store.getCaseByNumber(caseNumber);
      if (!c || !verifyPassword(code, c.followup_hash)) {
        res.status(404).json({ error: "لا توجد قضية بهذا الرمز" });
        return;
      }
      store.addEvidence(caseNumber, entry);
      res.status(201).json({ ok: true });
    }
  );

  app.post(
    "/api/cases/delete",
    rateLimit({ windowMs: 60 * 60_000, max: rl(10), key: "case-delete" }),
    (req, res) => {
      const parsed = CaseAccessBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "بيانات غير صالحة" });
        return;
      }
      const { caseNumber, code } = parsed.data;
      const c = store.getCaseByNumber(caseNumber);
      if (!c || !verifyPassword(code, c.followup_hash)) {
        res.status(404).json({ error: "لا توجد قضية بهذا الرمز" });
        return;
      }
      store.deleteCase(caseNumber);
      logInfo("case_deleted", {});
      res.json({ ok: true, message: "حُذفت القضية وأدلتها وسجلها نهائياً" });
    }
  );

  // ---------- شبكة الدول العربية ----------
  app.get("/api/countries", (_req, res) => {
    res.json({ countries });
  });

  app.get("/api/countries/:code", (req, res) => {
    const c = getCountry(req.params.code);
    if (!c) {
      res.status(404).json({ error: "الدولة غير موجودة في السجل" });
      return;
    }
    res.json({ country: c });
  });

  // ---------- مركز الشفافية (إحصاءات مجمعة بلا أي بيانات شخصية) ----------
  app.get("/api/trust", (_req, res) => {
    const s = store.caseStats();
    const statuses = store.statusMap();
    const publishedResources = officialResources.filter(
      (r) => (statuses.get(`resource:${r.id}`) ?? "published") === "published"
    );
    res.json({
      casesTotal: s.total,
      casesByStatus: s.byStatus,
      criticalCases: s.critical,
      evidenceCount: s.evidenceCount,
      countriesTotal: countries.length,
      countriesVerified: countries.filter((c) => c.cert?.status === "VERIFIED").length,
      resourcesPublished: publishedResources.length,
      resourcesVerified: publishedResources.filter((r) => r.status === "verified").length,
      lessonsPublished: [...lessonsPartA, ...lessonsPartB].filter(
        (l) => (statuses.get(`lesson:${l.id}`) ?? "published") === "published"
      ).length,
      activePartnerships: 0,
      disclaimer:
        "الأرقام إحصاءات مجمعة لا تحتوي أي بيانات شخصية، ولا تشمل قضايا حُذفت بطلب أصحابها.",
    });
  });

  // ---------- المستشار الذكي ----------
  app.post(
    "/api/ai/chat",
    rateLimit({ windowMs: 15 * 60_000, max: rl(15), key: "ai-chat" }),
    async (req, res) => {
      const parsed = AiChatBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "رسائل المحادثة غير صالحة" });
        return;
      }
      // تعقيم إضافي على الخادم: أدوار مسموحة فقط وآخر 12 رسالة
      const clean = sanitizeHistory(parsed.data.messages);
      if (clean.length === 0 || clean[clean.length - 1]!.role !== "user") {
        res.status(400).json({ error: "آخر رسالة يجب أن تكون منك" });
        return;
      }
      const started = Date.now();
      const result = await askChatAdvisor(env, clean);
      // لا يُسجل محتوى المحادثة — بيانات تشغيلية فقط
      logInfo("ai_chat", { ok: result.ok, turns: clean.length, ms: Date.now() - started });
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json({ reply: result.reply });
    }
  );

  // بثّ تدريجي: يعرض الرد وهو يتكوّن بدل انتظار صامت
  app.post(
    "/api/ai/chat/stream",
    rateLimit({ windowMs: 15 * 60_000, max: rl(15), key: "ai-chat" }),
    async (req, res) => {
      const parsed = AiChatBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "رسائل المحادثة غير صالحة" });
        return;
      }
      const clean = sanitizeHistory(parsed.data.messages);
      if (clean.length === 0 || clean[clean.length - 1]!.role !== "user") {
        res.status(400).json({ error: "آخر رسالة يجب أن تكون منك" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (obj: unknown) => {
        try {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } catch {
          /* انقطع العميل */
        }
      };
      const started = Date.now();
      const controller = new AbortController();
      req.on("close", () => controller.abort()); // انقطع العميل → أوقف نداء المزود
      let thinkingSent = false;
      const result = await askChatAdvisorStream(
        env,
        clean,
        (delta) => send({ delta }),
        controller.signal,
        () => {
          if (!thinkingSent) {
            thinkingSent = true;
            send({ thinking: true });
          }
        }
      );
      logInfo("ai_chat_stream", { ok: result.ok, turns: clean.length, ms: Date.now() - started, model: result.model ?? null });
      if (result.ok) {
        send({ done: true, model: result.model });
      } else {
        send({ error: result.error });
      }
      res.end();
    }
  );

  // ---------- معالج الأخطاء ----------
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "المسار غير موجود" });
  });

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    logWarn("unhandled_error", { name: err.constructor.name });
    res.status(err.status ?? 500).json({ error: "حدث خطأ داخلي — عاود المحاولة لاحقاً" });
  });

  // ---------- الملفات الثابتة (الإنتاج) ----------
  const clientDist = path.resolve("dist/client");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: "index.html", maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(clientDist, "index.html"));
    });
    // أي شيء آخر (غير /api) وُصل إليه هنا بعد sendFile fallback يعني ملف ناقص
    app.use((_req, res) => {
      res.status(404).send("Not found");
    });
  }

  return app;
}

export function readEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export { CSRF_COOKIE };
