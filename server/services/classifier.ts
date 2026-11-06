import type { Playbook, Urgency } from "../../shared/types.js";
import { allPlaybooks } from "../../shared/content/playbooks-index.js";

/**
 * تطبيع النص العربي: إزالة التشكيل وتوحيد الألف والهمزات والهاء/التاء المربوطة
 * لتقوية المطابقة الكلمية دون الاعتماد على إملاء المستخدم.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // تشكيل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ـl]/g, "")
    .toLowerCase();
}

/** كلمات تدل على علاقة بالأمن السيبراني — لفحص النطاق */
const CYBER_SCOPE_WORDS = [
  "حساب", "اخترق", "اختراق", "اناخترق", "هاكر", "هكر", "سرق", "سرقه", "كلمه المرور", "الباسورد", "باسورد",
  "بريد", "ايميل", "جيميل", "واتساب", "واتس", "تيليجرام", "تويتر", "فيسبوك", "انستقرام", "انستغرام", "سناب",
  "تيك توك", "تصيد", "فيشينغ", "phishing", "hack", "hacked", "password", "email", "account",
  "فيروس", "فدية", "ransomware", "malware", "شريحه", "شريحتي", "sim", "ابتزاز", "تنمر", "انتحال",
  "تحويل", "بنك", "احتيال", "نصب", "فلوس", "بطاقه", "فيزا", "بطاقه مدى", "mada", "تسريب", "رابط", "ملف مشبوه",
  "تنبيه دخول", "دخول مشبوه", "تسجيل دخول", "خصم", "شراء", "متجر", "طلب", "شحنه", "استثمار", "كريبتو",
  "عملات", "بيتكوين", "ملاحقه", "مراقبه", "تجسس", "كاميرا", "مايك", "موقعك", "مكاني", "تهديد", "صوري",
  "خصوصيه", "خصوصية", "vpn", "واي فاي", "واي فاي", "شبكه", "انترنت", "لابتوب", "جهازي", "جوال", "هاتفي",
  "سكرين شوت", "رمز التحقق", "رمز تحقق", "otp", "تثبيت برنامج", "تحديث", "نسخه احتياطيه", "بلوك", "حظر", "محظور", "بلاغ",
];

/** عبارات خطر جسدي وشيك — أعلى من كل شيء */
const EMERGENCY_WORDS = [
  "سياتيني", "سيضربني", "يهددني بالقتل", "هددني بالقتل", "هدد بالقتل", "تهديد بالقتل",
  "جاء البيت", "جا البيت", "جاي البيت", "جاء للبيت", "واقف على البيت", "قدام البيت",
  "يريد قتلي", "يريد ايذائي", "سايق عندي", "خطر على حياتي", "بيؤذيني", "يضربني", "بيضربني",
  "اطفالي في خطر", "سيئذيه", "بيقتلني", "بالسلاح", "مسلح",
];

/** إشارات خطر حرِج عامة — ترفع أي واقعة إلى حرجة */
const CRITICAL_WORDS = [
  "يبتزني", "ابتزاز", "يطلب فلوس", "طلبوا فلوس", "طلب مني فلوس", "يطلب من اصحابي", "طلبوا من اصحابي",
  "طلبوا من اصحابي فلوس", "يهدد بنشر", "يهددني بنشر", "هدد بنشر", "بنشر صور", "بنشر صوري",
  "سرقوا فلوس", "سرقوا مني", "انخصم من حسابي", "خصموا من", "حولوا من حسابي", "سرقوا البطاقه",
  "يستخدم حسابي الان", "يرسل من حسابي", "نشر صورتي", "سينشر صور", "سوف ينشر",
];

/** عبارات انزعاج نفسي قوي */
const DISTRESS_WORDS = [
  "ما ابغى اعيش", "تعبت من الحياه", "انتحار", "انهي حياتي", "ما تحمل", "مكتئب جدا", "خايف جدا", "مصدوم",
];

/** إشارات فقدان التحكم */
const LOST_CONTROL_WORDS = [
  "ما اقدر ادخل", "لا استطيع الدخول", "فقدت الوصول", "ما ينفع ادخل", "غير كلمه المرور", "غيروا كلمه المرور",
  "طردوني من حسابي", "سجلو خروج", "ما اعرف ادخل", "الحساب مو معي", "لا املك الوصول", "انسرق الحساب",
];

/** إشارات امتلاك التحكم */
const HAS_CONTROL_WORDS = [
  "قدر ادخل", "ما زلت ادخل", "دخلت وغيرت", "وصلت للحساب", "الحساب عندي", "ما زال عندي", "قدرت ادخل",
  "سمحت ادخل", "الحساب شغال عندي",
];

export interface Classification {
  best?: Playbook;
  bestScore: number;
  runnerUp?: Playbook;
  runnerUpScore: number;
}

export function classifyIncident(text: string): Classification {
  const norm = normalizeArabic(text);
  const scored = allPlaybooks
    .map((p) => {
      let score = 0;
      for (const sig of p.signals) {
        if (norm.includes(normalizeArabic(sig))) score += sig.includes(" ") ? 3 : 2;
      }
      return { playbook: p, score };
    })
    .sort((a, b) => b.score - a.score);

  const [first, second] = scored;
  return {
    best: first && first.score > 0 ? first.playbook : undefined,
    bestScore: first?.score ?? 0,
    runnerUp: second && second.score > 0 ? second.playbook : undefined,
    runnerUpScore: second?.score ?? 0,
  };
}

export function inCyberScope(text: string): boolean {
  const norm = normalizeArabic(text);
  return CYBER_SCOPE_WORDS.some((w) => norm.includes(normalizeArabic(w)));
}

export function hasEmergency(text: string): boolean {
  const norm = normalizeArabic(text);
  return EMERGENCY_WORDS.some((w) => norm.includes(normalizeArabic(w)));
}

export function hasDistress(text: string): boolean {
  const norm = normalizeArabic(text);
  return DISTRESS_WORDS.some((w) => norm.includes(normalizeArabic(w)));
}

export function detectControlStatus(text: string): "has_control" | "lost_control" | undefined {
  const norm = normalizeArabic(text);
  if (LOST_CONTROL_WORDS.some((w) => norm.includes(normalizeArabic(w)))) return "lost_control";
  if (HAS_CONTROL_WORDS.some((w) => norm.includes(normalizeArabic(w)))) return "has_control";
  return undefined;
}

const URGENCY_ORDER: Record<Urgency, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function maxUrgency(a: Urgency | undefined, b: Urgency | undefined): Urgency {
  const av = a ? URGENCY_ORDER[a] : 0;
  const bv = b ? URGENCY_ORDER[b] : 0;
  return (av >= bv ? a : b) ?? "low";
}

export function assessUrgency(text: string, playbook: Playbook): { urgency: Urgency; reason: string } {
  const norm = normalizeArabic(text);
  if (hasEmergency(text)) {
    return {
      urgency: "critical",
      reason: "ذكرتَ تهديداً بالأذى الجسدي — سلامتك الجسدية تسبق أي إجراء رقمي",
    };
  }
  if (CRITICAL_WORDS.some((w) => norm.includes(normalizeArabic(w)))) {
    return {
      urgency: "critical",
      reason: "تفاصيلك تتضمن ضرراً نشطاً (مالياً أو ابتزازاً جارياً أو نشراً مهدداً) يستدعي تحركاً فورياً",
    };
  }
  if (playbook.criticalSignals?.some((sig) => norm.includes(normalizeArabic(sig)))) {
    return {
      urgency: "critical",
      reason: "تفاصيلك تتضمن ضرراً نشطاً (مالي أو جسدي أو ابتزازاً جارياً) يستدعي تحركاً فورياً",
    };
  }
  const financial = ["تحويل", "انخصم", "خصم من", "دفعت", "البطاقه", "البنك"].some((w) =>
    norm.includes(normalizeArabic(w))
  );
  if (financial && URGENCY_ORDER[playbook.defaultUrgency] < 3) {
    return { urgency: "high", reason: "وجود أثر مالي محتمل يرفع الأولوية" };
  }
  return {
    urgency: playbook.defaultUrgency,
    reason: "مبني على نوع الواقعة المبدئي — سيتحدّث كلما وصلت معلومات جديدة",
  };
}

/** تحديد التصعيد الحرِج لأجل القاصرين في حوادث المحتوى الحميم */
export function involvesMinor(text: string): boolean {
  const norm = normalizeArabic(text);
  return ["قاصر", "عمري ١٤", "عمري ١٥", "عمري ١٦", "عمري ١٧", "عمري 14", "عمري 15", "عمري 16", "عمري 17", "ابني", "بنتي الصغيره", "اختي الصغيره", "اخوي الصغير", "طفل"].some((w) =>
    norm.includes(normalizeArabic(w))
  );
}
