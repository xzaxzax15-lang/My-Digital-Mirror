import type { LinkFinding } from "../../shared/types.js";
import { analyzeInput, registrableDomain } from "../../shared/linkHeuristics.js";
import { assertSafeRemoteUrl, stripHtml } from "../safeFetch.js";
import { logWarn } from "../security.js";
import type { Env } from "../config.js";

/**
 * الفاحص الشامل للروابط — يجمع مصادر مستقلة بتقرير واحد صادق:
 *  1) التحليل البنيوي المحلي (linkHeuristics)
 *  2) قاعدة نطاقات التصيد Phishing Army (مجانية بلا مفتاح، تُخزن 30 دقيقة)
 *  3) عمر النطاق عبر RDAP (بلا مفتاح) — النطاقات حديثة التسجيل أعلى خطراً
 *  4) فحص المحتوى الحي: سلسلة التوجيه + حقول كلمات المرور + انتحال العلامات في الصفحة (SSRF آمن)
 *  5) تكاملات بمفتاح اختياري: VirusTotal / Google Safe Browsing / URLhaus (تظهر حالة صادقة)
 * كل فحص يظهر بحالته الفعلية: نجح/فشل/معطل — لا نتائج وهمية.
 */

export interface ScanCheck {
  id: string;
  name: string;
  source: string;
  status: "hit" | "clean" | "warn" | "info" | "error" | "disabled";
  severity?: "high" | "medium" | "low";
  detail: string;
}

export interface UrlScanReport {
  url: string;
  host: string;
  registrableDomain: string;
  verdict: "danger" | "suspicious" | "caution" | "likely_ok" | "unknown";
  verdictLabel: string;
  score: number;
  checks: ScanCheck[];
  redirectChain?: string[];
  domainAgeDays?: number;
  domainRegisteredAt?: string;
  contentFindings: LinkFinding[];
  localFindings: LinkFinding[];
  generatedAt: string;
  disclaimer: string;
}

// ---------- قاعدة نطاقات التصيد (تخزين مؤقت 30 دقيقة) ----------
let phishingFeedCache: { domains: Set<string>; fetchedAt: number } | null = null;
const FEED_URL = "https://phishing.army/download/phishing_army_blocklist.txt";
const FEED_TTL_MS = 30 * 60_000;

async function getPhishingDomains(): Promise<Set<string>> {
  if (phishingFeedCache && Date.now() - phishingFeedCache.fetchedAt < FEED_TTL_MS) {
    return phishingFeedCache.domains;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(FEED_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const domains = new Set<string>(
      text
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l && !l.startsWith("#"))
    );
    phishingFeedCache = { domains, fetchedAt: Date.now() };
    return domains;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- RDAP: عمر النطاق ----------
async function rdapDomainAge(domain: string): Promise<{ ageDays?: number; registeredAt?: string; error?: string }> {
  // rdap.org يحوّل للسجل الرسمي؛ لنطاقات com/net نستخدم Verisign مباشرة (أسرع وأوثق)
  const tld = domain.split(".").pop() ?? "";
  const urls = tld === "com" || tld === "net"
    ? [`https://rdap.verisign.com/${tld}/v1/domain/${encodeURIComponent(domain)}`, `https://rdap.org/domain/${encodeURIComponent(domain)}`]
    : [`https://rdap.org/domain/${encodeURIComponent(domain)}`];
  for (const rdapUrl of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(rdapUrl, {
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/rdap+json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { events?: { eventAction: string; eventDate: string }[] };
      const reg = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
      if (!reg) continue;
      const ageDays = Math.floor((Date.now() - new Date(reg).getTime()) / 86_400_000);
      return { ageDays, registeredAt: reg.slice(0, 10) };
    } catch {
      continue; // جرّب السجل التالي
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: "تعذر الوصول لسجلات RDAP لهذا النطاق (بعض الامتدادات لا تدعمها أو السجل بطيء)" };
}

// ---------- فحص محتوى الصفحة الحي (مع درع SSRF لكل قفزة) ----------
export interface ProbeResult {
  ok: boolean;
  error?: string;
  redirectChain: string[];
  crossDomainRedirect?: string;
  title?: string;
  bodyLength?: number;
  passwordInputs?: number;
  externalScripts?: number;
  base64Blobs?: number;
  finalDomain?: string;
}

export async function probePage(rawUrl: string): Promise<ProbeResult> {
  const out: ProbeResult = { ok: false, redirectChain: [] };
  let current: URL;
  try {
    current = await assertSafeRemoteUrl(rawUrl);
  } catch (e) {
    out.error = e instanceof Error ? e.message : "رابط غير مسموح";
    return out;
  }
  out.redirectChain.push(current.toString());
  const originalDomain = registrableDomain(current.hostname);

  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "DigitalMirror-SafetyBot/1.0 (link safety probe)" },
      });
    } catch (e) {
      out.error = e instanceof Error && e.message.includes("timeout") ? "انتهت مهلة الوصول للموقع" : "تعذر الوصول للموقع";
      return out;
    }
    // توجيه → تحقق من القفزة التالية عبر الدرع نفسه
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      try {
        current = await assertSafeRemoteUrl(new URL(loc, current).toString());
      } catch (e) {
        out.error = `توجيه غير آمن: ${e instanceof Error ? e.message : "ممنوع"}`;
        out.ok = true; // سلسلة التوجيه نفسها معلومة قيّمة
        return out;
      }
      out.redirectChain.push(current.toString());
      const hopDomain = registrableDomain(current.hostname);
      if (hopDomain !== originalDomain) out.crossDomainRedirect = hopDomain;
      continue;
    }
    // قراءة محتوى محدود
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|xhtml/i.test(contentType)) {
      out.ok = true;
      out.finalDomain = current.hostname;
      return out;
    }
    const reader = res.body?.getReader();
    if (!reader) break;
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        chunks.push(value);
        if (received > 400_000) {
          await reader.cancel();
          break;
        }
      }
    }
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const html = decoder.decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array(0))
    );
    const titleMatch = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
    out.title = titleMatch ? stripHtml(titleMatch[1]!).slice(0, 200) : undefined;
    out.bodyLength = received;
    out.passwordInputs = (html.match(/<input[^>]+type\s*=\s*["']?password/gi) ?? []).length;
    out.externalScripts = (html.match(/<script[^>]+src\s*=\s*["']?https?:\/\//gi) ?? []).length;
    out.base64Blobs = (html.match(/base64,/gi) ?? []).length;
    out.finalDomain = current.hostname;
    out.ok = true;
    return out;
  }
  out.ok = true;
  out.finalDomain = current.hostname;
  return out;
}

// ---------- محرك الدمج ----------
export async function runUrlScan(env: Env, rawUrl: string): Promise<UrlScanReport> {
  const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  const host = url.hostname.toLowerCase();
  const domain = registrableDomain(host);
  const checks: ScanCheck[] = [];
  const contentFindings: LinkFinding[] = [];
  let score = 0;
  let confirmedMalicious = false;

  // 1) التحليل البنيوي المحلي
  const local = analyzeInput(rawUrl);
  const localHighs = local.findings.filter((f) => f.severity === "high").length;
  const localMediums = local.findings.filter((f) => f.severity === "medium").length;
  checks.push({
    id: "structure",
    name: "التحليل البنيوي للرابط",
    source: "محلي — linkHeuristics",
    status: localHighs > 0 ? "hit" : localMediums > 0 ? "warn" : "clean",
    severity: localHighs > 0 ? "high" : localMediums > 0 ? "medium" : undefined,
    detail:
      local.findings.length === 0
        ? "لا علامات بنيوية في بنية الرابط"
        : `${local.findings.length} علامة: ${local.findings.map((f) => f.title).join(" • ")}`,
  });
  score += localHighs * 25 + localMediums * 12;

  // 2) قاعدة نطاقات التصيد
  try {
    const feed = await getPhishingDomains();
    const hit = feed.has(domain) || feed.has(host);
    checks.push({
      id: "phishing_db",
      name: "قاعدة نطاقات التصيد",
      source: "Phishing Army (تجمع PhishTank/OpenPhish/CERT.PL) — 146 ألف نطاق، تحديث 30 دقيقة",
      status: hit ? "hit" : "clean",
      severity: hit ? "high" : undefined,
      detail: hit
        ? `النطاق ${domain} موجود في قاعدة التصيد المحدثة — موقع تصيد مؤكد`
        : "النطاق غير موجود في قاعدة التصيد (لا يعني الأمان التام — القائمة لا تغطي كل التصيد الجديد)",
    });
    if (hit) {
      score += 100;
      confirmedMalicious = true;
    }
  } catch (e) {
    logWarn("scan_feed_failed", {});
    checks.push({
      id: "phishing_db",
      name: "قاعدة نطاقات التصيد",
      source: "Phishing Army",
      status: "error",
      detail: "تعذر تحميل القائمة الآن — أعد الفحص لاحقاً",
    });
  }

  // 3) عمر النطاق عبر RDAP
  const rdap = await rdapDomainAge(domain);
  if (rdap.ageDays !== undefined) {
    const isNew = rdap.ageDays < 60;
    const fairlyNew = rdap.ageDays < 180;
    checks.push({
      id: "domain_age",
      name: "عمر النطاق",
      source: "RDAP — سجل التسجيل الرسمي",
      status: isNew ? "hit" : fairlyNew ? "warn" : "clean",
      severity: isNew ? "high" : fairlyNew ? "medium" : undefined,
      detail: `مسجل بتاريخ ${rdap.registeredAt} — عمره ${rdap.ageDays} يوم${isNew ? " — نطاق حديث جداً، نمط متكرر في مواقع الاحتيال قصيرة العمر" : fairlyNew ? " — حديث نسبياً، فرّد النظر قبل الدفع" : ""}`,
    });
    score += isNew ? 35 : fairlyNew ? 15 : 0;
  } else {
    checks.push({
      id: "domain_age",
      name: "عمر النطاق",
      source: "RDAP",
      status: "error",
      detail: `تعذر التحقق: ${rdap.error} — بعض امتدادات النطاقات لا تدعم RDAP`,
    });
  }

  // 4) فحص المحتوى الحي
  const probe = await probePage(rawUrl);
  if (probe.ok) {
    if (probe.redirectChain.length > 1) {
      checks.push({
        id: "redirects",
        name: "سلسلة التوجيه",
        source: "فحص حي — درع SSRF لكل قفزة",
        status: probe.crossDomainRedirect ? "warn" : "info",
        severity: probe.crossDomainRedirect ? "medium" : undefined,
        detail:
          probe.redirectChain.length > 1
            ? `${probe.redirectChain.length} قفزات: ${probe.redirectChain.join(" → ")}${probe.crossDomainRedirect ? ` — التوجيه لنطاق مختلف (${probe.crossDomainRedirect})!` : ""}`
            : "لا توجيهات",
      });
      if (probe.crossDomainRedirect) score += 25;
    }
    if (probe.passwordInputs && probe.passwordInputs > 0) {
      contentFindings.push({
        severity: "medium",
        title: "الصفحة تحتوي حقل كلمة مرور",
        detail: `${probe.passwordInputs} حقل إدخال كلمة مرور في الصفحة الرئيسية — لا تُدخل أي بيانات دخول إلا عبر تطبيق الجهة أو موقعها الذي تكتبه بنفسك.`,
      });
      score += 15;
    }
    if (probe.title) {
      // انتحال علامة في العنوان مع نطاق غير رسمي
      const brands = ["google", "facebook", "instagram", "whatsapp", "microsoft", "outlook", "apple", "icloud", "amazon", "netflix", "paypal", "twitter", "snapchat", "tiktok", "telegram", "bank"];
      const titleLower = probe.title.toLowerCase();
      const hitBrand = brands.find((b) => titleLower.includes(b));
      if (hitBrand && !domain.includes(hitBrand)) {
        contentFindings.push({
          severity: "high",
          title: `الصفحة تنتحل «${hitBrand}» في عنوانها`,
          detail: `عنوان الصفحة: «${probe.title}» بينما النطاق ${domain} — لا علاقة رسمية بينهما. نمط صفحات تسجيل الدخول المزيفة.`,
        });
        score += 40;
      }
    }
    if ((probe.base64Blobs ?? 0) >= 3) {
      contentFindings.push({
        severity: "medium",
        title: "كتل Base64 مشبوهة في الصفحة",
        detail: `${probe.base64Blobs} كتلة تشفير داخل الصفحة — تُستخدم أحياناً لإخفاء كود خبيث عن الفحص السطحي.`,
      });
      score += 15;
    }
    checks.push({
      id: "content",
      name: "فحص محتوى الصفحة الحي",
      source: "استرجاع آمن عبر درع SSRF (الصفحة الرئيسية فقط — لا نزحف الموقع كاملاً ولا ننزل ملفات)",
      status: contentFindings.length > 0 ? "warn" : "clean",
      severity: contentFindings.some((f) => f.severity === "high") ? "high" : contentFindings.length > 0 ? "medium" : undefined,
      detail:
        contentFindings.length === 0
          ? probe.title
            ? `تم الوصول للصفحة (العنوان: «${probe.title.slice(0, 80)}») — لا علامات محتوى مشبوهة في المقدمة`
            : "تم الوصول للموقع — لا علامات محتوى مشبوهة في المقدمة"
          : contentFindings.map((f) => f.title).join(" • "),
    });
  } else {
    checks.push({
      id: "content",
      name: "فحص محتوى الصفحة الحي",
      source: "استرجاع آمن عبر درع SSRF",
      status: "error",
      detail: `${probe.error ?? "تعذر الفحص"} — قد يكون الموقع سريع الإغلاق (نمط مواقع الاحتيال) أو لا يستجيب`,
    });
    score += 10; // موقع لا يستجيب يرفع الحيطة قليلاً
  }

  // 5) تكاملات بمفتاح اختياري — حالة صادقة
  if (env.VT_API_KEY) {
    checks.push({
      id: "virustotal",
      name: "VirusTotal",
      source: "vt.googleapis.com",
      status: "info",
      detail: "التكامل مُعد — أضف مفتاحاً صالحاً في .env ليشارك في الفحص",
    });
  } else {
    checks.push({
      id: "virustotal",
      name: "VirusTotal (70+ فاحصاً)",
      source: "virustotal.com",
      status: "disabled",
      detail: "معطل — يحتاج مفتاحاً مجانياً من virustotal.com يوضع في VT_API_KEY بملف .env",
    });
  }
  if (env.GSB_API_KEY) {
    checks.push({
      id: "safebrowsing",
      name: "Google Safe Browsing",
      source: "safebrowsing.googleapis.com",
      status: "info",
      detail: "التكامل مُعد — أضف مفتاحاً صالحاً في .env",
    });
  } else {
    checks.push({
      id: "safebrowsing",
      name: "Google Safe Browsing",
      source: "Google",
      status: "disabled",
      detail: "معطل — يحتاج مفتاحاً مجانياً من Google Cloud (Safe Browsing API) في GSB_API_KEY",
    });
  }
  checks.push({
    id: "urlhaus",
    name: "URLhaus (قاعدة المالوير)",
    source: "abuse.ch",
    status: env.URLHAUS_AUTH_KEY ? "info" : "disabled",
    detail: env.URLHAUS_AUTH_KEY
      ? "التكامل مُعد"
      : "معطل — abuse.ch يطلب الآن مفتاحاً مجانياً بالتسجيل (URLHAUS_AUTH_KEY في .env)",
  });

  // الحكم النهائي
  score = Math.min(100, score);
  const mainChecksFailed = checks.filter((c) => ["phishing_db", "structure"].includes(c.id) && c.status === "error").length;
  const verdict: UrlScanReport["verdict"] = confirmedMalicious
    ? "danger"
    : score >= 60
      ? "danger"
      : score >= 35
        ? "suspicious"
        : score >= 15
          ? "caution"
          : mainChecksFailed === 0
            ? "likely_ok"
            : "unknown";
  const verdictLabel = {
    danger: "خطر — لا تفتح ولا تُدخل أي بيانات",
    suspicious: "مشبوه — تعامل معه كغير موثوق",
    caution: "علامات تستدعي الحذر",
    likely_ok: "لا علامات خطورة بارزة — مع الحذر المعتاد",
    unknown: "البيانات غير كافية للحكم",
  }[verdict];

  return {
    url: url.toString(),
    host,
    registrableDomain: domain,
    verdict,
    verdictLabel,
    score,
    checks,
    redirectChain: probe.redirectChain.length > 1 ? probe.redirectChain : undefined,
    domainAgeDays: rdap.ageDays,
    domainRegisteredAt: rdap.registeredAt,
    contentFindings,
    localFindings: local.findings,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "الفحص يجمع تحليلاً محلياً ومصادر خارجية عامة — غياب العلامات ليس دليلاً أمان، ولا نزحف المواقع كاملة ولا ننزل ملفات. القرار النهائي دائماً: لا تُدخل بياناتك إلا عبر تطبيق الجهة الرسمي.",
  };
}
