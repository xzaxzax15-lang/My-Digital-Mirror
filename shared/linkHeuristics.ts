import type { LinkAnalysis, LinkFinding } from "./types.js";

/**
 * تحليل دفاعي للروابط والرسائل — محلي بالكامل، لا يزور أي رابط أبداً.
 * النتائج إرشادية تعليمية، و«لم يُعثر على خطر» لا تعني «آمن».
 */

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "is.gd", "ow.ly", "buff.ly", "cutt.ly",
  "rebrand.ly", "shorturl.at", "rb.gy", "tiny.cc", "bl.ink", "s.id", "lnkd.in",
]);

const RISKY_TLDS = new Set(["zip", "mov", "top", "xyz", "gq", "tk", "ml", "cf", "work", "click", "link", "rest"]);

/** نطاقات دول من المستوى الثاني شائعة في المنطقة */
const SECOND_LEVEL = new Set(["com", "net", "org", "gov", "edu", "ac", "co", "sch", "or"]);

const BRANDS: { brand: string; words: string[]; official: string[] }[] = [
  { brand: "Google", words: ["google", "gmail"], official: ["google.com", "gmail.com", "googleapis.com"] },
  { brand: "Microsoft", words: ["microsoft", "outlook", "hotmail"], official: ["microsoft.com", "outlook.com", "live.com", "office.com", "hotmail.com"] },
  { brand: "Apple", words: ["apple", "icloud"], official: ["apple.com", "icloud.com"] },
  { brand: "Facebook/ميتا", words: ["facebook"], official: ["facebook.com", "meta.com", "fb.com", "fbcdn.net"] },
  { brand: "Instagram", words: ["instagram"], official: ["instagram.com"] },
  { brand: "WhatsApp", words: ["whatsapp"], official: ["whatsapp.com"] },
  { brand: "X (تويتر)", words: ["twitter"], official: ["twitter.com", "x.com"] },
  { brand: "Snapchat", words: ["snapchat"], official: ["snapchat.com"] },
  { brand: "TikTok", words: ["tiktok"], official: ["tiktok.com"] },
  { brand: "Telegram", words: ["telegram"], official: ["telegram.org"] },
  { brand: "Amazon", words: ["amazon"], official: ["amazon.com"] },
  { brand: "Netflix", words: ["netflix"], official: ["netflix.com"] },
  { brand: "PayPal", words: ["paypal"], official: ["paypal.com"] },
];

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!؟)]+$/, ""));
}

/** استخراج النطاق المسجل تقريبياً (آخر تسميتين مع مراعاة .com.sa ونحوها) */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last = parts[parts.length - 1] ?? "";
  const secondLast = parts[parts.length - 2] ?? "";
  if (parts.length >= 3 && SECOND_LEVEL.has(secondLast) && last.length === 2) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function lookalikeFindings(domain: string, host: string): LinkFinding[] {
  const findings: LinkFinding[] = [];
  const registrable = registrableDomain(domain);
  const full = host.toLowerCase();

  for (const b of BRANDS) {
    // النطاق المسجل نفسه يعود للعلامة → رسمي (يشمل نطاقاتها الفرعية)
    if (b.official.includes(registrable)) continue;
    const hit = b.words.find((w) => full.includes(w));
    if (hit) {
      findings.push({
        severity: "high",
        title: `استخدام اسم «${b.brand}» في نطاق غير رسمي`,
        detail: `المضيف يحتوي «${hit}» بينما النطاق المسجل هو ${registrable} وليس نطاق ${b.brand} الرسمي (${b.official[0]}). هذه البنية أشهر أنماط انتحال العلامات.`,
      });
    }
  }

  // تشابه حروفي (rn/m، 0/o، 1/l) مع جذر علامة مشهورة — فقط حين يغيّر الاستبدال الجذر فعلاً
  const bare = registrable.replace(/\.[a-z]+$/, "");
  for (const b of BRANDS) {
    const root = (b.official[0] ?? "").split(".")[0] ?? "";
    if (!root) continue;
    const withRN = root.replace(/m/g, "rn");
    const with0 = root.replace(/o/g, "0");
    const with1 = root.replace(/[li]/g, "1");
    const transformed =
      (withRN !== root && bare === withRN) ||
      (with0 !== root && bare === with0) ||
      (with1 !== root && bare === with1);
    if (transformed && !b.official.includes(registrable)) {
      findings.push({
        severity: "high",
        title: "تشابه حروفي مع نطاق مشهور",
        detail: `النطاق يشبه «${b.official[0]}» مع استبدال حروف متشابهة (rn/m أو 0/o أو 1/l) — خدعة بصرية كلاسيكية.`,
      });
      break;
    }
  }
  return findings;
}

export function analyzeInput(rawInput: string): LinkAnalysis {
  const input = rawInput.trim();
  const findings: LinkFinding[] = [];
  const nextSteps: string[] = [];
  let url: URL | undefined;
  let kind: LinkAnalysis["inputKind"] = "unknown";

  const urls = extractUrls(input);
  if (urls.length > 0) {
    kind = "url";
    try {
      url = new URL(urls[0]!.startsWith("http") ? urls[0]! : `https://${urls[0]!}`);
    } catch {
      url = undefined;
    }
  }
  if (url === undefined && input.length > 0) kind = urls.length > 0 ? "url" : "message";

  if (kind === "message" || urls.length > 1) {
    findings.push({
      severity: "info",
      title: "تحليل رسالة نصية",
      detail: `عثرت على ${urls.length} رابط داخل النص. التحليل أدناه يخص أول رابط، والرسالة كاملة تبقى في جهازك ولا تُرسل لأي جهة.`,
    });
  }

  const host = url?.hostname ?? "";
  const domain = host.replace(/^www\./, "");

  if (url && host) {
    // بروتوكول
    if (url.protocol === "http:") {
      findings.push({
        severity: "medium",
        title: "اتصال غير مشفر (http)",
        detail: "الرابط يستخدم http وليس https — أي بيانات تُدخلها قد تُقرأ في الطريق. المواقع الحساسة لا تعمل بـ http اليوم.",
      });
    }
    // IP بدل النطاق
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      findings.push({
        severity: "high",
        title: "عنوان IP مباشر بدل نطاق",
        detail: "الرابط يشير لعنوان رقمي خام لا لاسم نطاق — نمط شائع في صفحات الاختراق المؤقتة.",
      });
    }
    // punycode
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      findings.push({
        severity: "high",
        title: "نطاق بترميز مموّه (Punycode)",
        detail: "يستخدم الرابط ترميزاً يعرض حروفاً غير لاتينية بشكل يحاكي نطاقات مشهورة — من أقوى أدوات الانتحال البصري.",
      });
    }
    // روابط مختصرة
    if (SHORTENERS.has(domain)) {
      findings.push({
        severity: "medium",
        title: "رابط مختصر يخفي الوجهة",
        detail: "خدمات التقصير مشروعة لكنها تخفي الوجهة الحقيقية تماماً. لا تفتحها في سياق مالي أو تحذيري.",
      });
    }
    // بيانات دخول داخل الرابط user:pass@
    if (url.username || url.password) {
      findings.push({
        severity: "high",
        title: "بيانات دخول مدمجة في الرابط",
        detail: "الرابط يحوي صيغة user:pass@host — خدعة قديمة لإخفاء الوجهة الحقيقية خلف نص مألوف.",
      });
    }
    // TLD مخاطر
    const tld = domain.split(".").pop() ?? "";
    if (RISKY_TLDS.has(tld)) {
      findings.push({
        severity: "medium",
        title: `امتداد نطاق عالي الخطورة (.${tld})`,
        detail: "بعض الامتدادات تُستخدم كثيفاً في حملات الاحتيال بسبب رخص التسجيل وضعف الرقابة — ليست إدانة قاطعة لكنها ترفع الحيطة.",
      });
    }
    // سلاسل نطاقات فرعية طويلة
    const subCount = host.split(".").length - 2;
    if (subCount >= 3) {
      findings.push({
        severity: "medium",
        title: "سلسلة نطاقات فرعية طويلة",
        detail: `الرابط يحوي ${subCount} مستويات فرعية — كثيراً ما تُستخدم لطمس النطاق الحقيقي داخل رابط طويل مألوف الشكل.`,
      });
    }
    // شرطات كثيرة
    const hyphens = (domain.match(/-/g) ?? []).length;
    if (hyphens >= 2) {
      findings.push({
        severity: "medium",
        title: "شرطات متعددة في النطاق",
        detail: "الشرطات المتكررة نمط شائع في نطاقات الانتحال مثل secure-login-bank-verify.com.",
      });
    }
    // كلمات حساسة في المسار
    const path = (url.pathname + url.search).toLowerCase();
    if (/login|signin|verify|secure|update|confirm|account|bank/.test(path) && !RISKY_TLDS.has(tld)) {
      findings.push({
        severity: "low",
        title: "كلمات دخول/تحقق في المسار",
        detail: "المسار يحوي كلمات مثل login/verify — وحدها لا تعني شيئاً، لكنها مع أي علامة أخرى ترفع الاحتمال. الأهم دائماً هو النطاق قبل أول شرطة مائلة.",
      });
    }
    // ملفات تنفيذية / APK
    if (/\.(apk|exe|scr|bat|cmd|msi|jar)([?#]|$)/i.test(path)) {
      findings.push({
        severity: "high",
        title: "رابط ملف تنفيذي أو APK مباشر",
        detail: "الرابط ينتهي بملف تنفيذي أو تطبيق خارج المتاجر الرسمية — أشهر نواقل البرمجيات الخبيثة والبنوك المزيفة على الجوال.",
      });
    }
    // منفذ غير قياسي
    if (url.port && url.port !== "80" && url.port !== "443") {
      findings.push({
        severity: "low",
        title: "منفذ غير قياسي في الرابط",
        detail: `الرابط يشير للمنفذ ${url.port} بدل 80/443 — يظهر أحياناً في صفحات احتيال مؤقتة.`,
      });
    }
    // ترميز مفرط
    if (/(?:%[0-9a-f]{2}){6,}/i.test(path)) {
      findings.push({
        severity: "low",
        title: "ترميز مفرط داخل الرابط",
        detail: "عدد كبير من الرموز المشفرة (%xx) قد يخفي الوجهة الحقيقية عن العين.",
      });
    }
    // نطاق مولد آلياً
    if (/[a-z0-9]{16,}\.(top|xyz|sbs|cfd|icu|buzz|monster)\b/i.test(domain)) {
      findings.push({
        severity: "medium",
        title: "نطاق يبدو مولداً آلياً",
        detail: "سلسلة حروف وأرقام طويلة عشوائية مع امتداد رخيص — نمط نطاقات التصيد قصيرة العمر.",
      });
    }
    // مخططات خطرة
    if (url.protocol === "javascript:" || url.protocol === "data:") {
      findings.push({
        severity: "high",
        title: "مخطط خطير (javascript/data)",
        detail: "الرابط ليس موقعاً بل كود ينفذ مباشرة — لا تفتحه إطلاقاً.",
      });
    }
    findings.push(...lookalikeFindings(domain, host));

    nextSteps.push(
      "قارن النطاق (ما قبل أول «/» مباشرة) بالنطاق الرسمي للجهة المدّعاة حرفاً بحرف",
      "إن كانت الرسالة تنتحل جهة تعرفها: تحقق من داخل تطبيقها الرسمي لا من الرابط",
      "لا تُدخل أي بيانات دخول في صفحة وصلت عبر رابط في رسالة"
    );
  }

  // تحليل نص الرسالة (إن وُجد نص حول الرابط)
  if (kind === "message" && input.length > 0) {
    const scamHits: string[] = [];
    const patterns: [RegExp, string][] = [
      [/مبروك|فزت|جائزة|ربحت/i, "ادعاء فوز بجائزة لم تشارك للفوز بها"],
      [/عاجل|فورا|خلال \d+ (دقيقة|ساعة)|آخر فرصة/i, "إلحاح مصطنع بوقت ضيق"],
      [/رسوم|دفعة بسيطة|تحويل مبلغ|مقدم/i, "طلب دفع مالي"],
      [/حسابك سي|سيتم ايقاف|سيغلق حسابك/i, "تهديد بإجراء ضد حسابك"],
      [/لا تخبر|سرا|بشكل سري/i, "طلب السرية"],
      [/رمز التحقق|الكود|otp/i, "طلب رمز تحقق — علامة احتيال قاطعة"],
    ];
    for (const [re, label] of patterns) {
      if (re.test(input)) scamHits.push(label);
    }
    // فئات احتيال مفصلة — أشهر الأنماط في المنطقة العربية
    const scamCategories: [RegExp, string, "high" | "medium"][] = [
      [/(وظيف|توظيف).*(رسوم|دفع|تحويل)|(رسوم|دفع).*(وظيف|توظيف)/i, "وظيفة وهمية تطلب رسوماً مقدمة — الوظائف الحقيقية لا تطلب مالاً", "high"],
      [/(جواز|جوازات|تأشيره|تأشيرة|فيزا عمل|هجرة).*(سريع|دون اختبار|مضمون|رسوم)/i, "خدمات جوازات أو تأشيرات وهمية — تُنجز فقط عبر الجهات الرسمية", "high"],
      [/(شحنه|شحنة|شحنتك|طرد|استلام).*(جمارك|رسوم|دفع|معلق)/i, "شحنة وهمية تطلب رسوماً جمركية عبر رابط", "high"],
      [/(استثمار|تداول|بيتكوين|كريبتو|عملات رقمية|فوركس)/i, "عرض استثماري — الأرباح المضمونة بصمة احتيال", "medium"],
      [/ابشر|أبشر|الابشر|الموارد البشرية|الجوازات|الدفاع المدني|وزارة الداخلية|الزكاة/i, "انتحال جهة حكومية — الجهات لا تجمع بياناتها عبر روابط رسائل", "high"],
      [/(دعم فني|فريق الدعم|الشكاوى).*(واتس|واتساب|تيليجرام|whatsapp|telegram)/i, "دعم فني مزيف يحوّلك لقناة شخصية — الدعم الرسمي لا يراسلك أولاً", "high"],
      [/(حظ|قرعة|iphone|ايفون|رصيد مجاني|باقة مجانية)/i, "جوائز ورصيد مجاني — عرض احتيالي كلاسيكي", "medium"],
    ];
    let categoryHighs = 0;
    const categoryNames: string[] = [];
    for (const [re, label, sev] of scamCategories) {
      if (re.test(input)) {
        categoryNames.push(label);
        if (sev === "high") categoryHighs++;
      }
    }
    if (categoryNames.length > 0) {
      findings.push({
        severity: categoryHighs > 0 ? "high" : "medium",
        title: `فئات احتيال مطابقة (${categoryNames.length})`,
        detail: categoryNames.join(" • "),
      });
    }
    if (scamHits.length > 0) {
      findings.push({
        severity: scamHits.length >= 2 ? "high" : "medium",
        title: `أنماط احتيال في نص الرسالة (${scamHits.length})`,
        detail: scamHits.join(" • "),
      });
    }
    nextSteps.push("لا ترد على الرسالة ولا تعيد إرسالها", "أبلغ عنها داخل التطبيق الذي وصلتك عبره");
  }

  const hasHigh = findings.some((f) => f.severity === "high");
  const hasMedium = findings.some((f) => f.severity === "medium");
  const riskLevel: LinkAnalysis["riskLevel"] =
    findings.length === 0 ? "insufficient" : hasHigh ? "high" : hasMedium ? "medium" : "low";

  const confidence =
    findings.length === 0
      ? "لا تكفي البيانات للحكم — غياب العلامات ليس دليل أمان"
      : hasHigh
        ? "علامات خدع واضحة في بنية الرابط/النص — تعامل معه كغير موثوق"
        : "علامات مبدئية تستدعي الحيطة — التحقق النهائي يبقى بالمقارنة مع القناة الرسمية";

  return {
    inputKind: kind,
    url: url?.toString(),
    host: host || undefined,
    registrableDomain: domain || undefined,
    findings,
    riskLevel,
    confidence,
    nextSteps:
      nextSteps.length > 0
        ? nextSteps
        : ["لا علامات بنيوية واضحة — يبقى الأصل: لا تدخل بياناتك إلا عبر تطبيق/موقع تكتبه بنفسك"],
    disclaimer:
      "هذا تحليل تعليمي لبنية الرابط والنص يجري محلياً دون زيارة الرابط. عدم وجود علامات لا يعني أن الرابط آمن.",
  };
}
