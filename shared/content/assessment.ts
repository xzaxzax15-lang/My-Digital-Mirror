import type { AssessmentQuestion, AssessmentResult } from "../types.js";

/**
 * التقييم الذاتي للأمن الشخصي — يعمل محلياً بالكامل.
 * لا يُرسل أي شيء للخادم. لا يُحفظ إلا بموافقة صريحة (localStorage).
 */
export const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: "unique_passwords",
    text: "كلمات المرور الخاصة بحساباتك المهمة (البريد، البنك، التواصل):",
    dimension: "كلمات المرور",
    options: [
      { label: "كلمة مرور واحدة تقريباً لكل شيء", points: 0 },
      { label: "كلمتان أو ثلاث أعيد استخدامهما", points: 3 },
      { label: "كلمة مختلفة لكل حساب مهم على الأقل", points: 7 },
      { label: "كلمة فريدة لكل حساب يولّدها مدير كلمات مرور", points: 10 },
    ],
  },
  {
    id: "mfa",
    text: "المصادقة الثنائية (رمز ثانٍ عند الدخول):",
    dimension: "حماية الحسابات",
    options: [
      { label: "غير مفعلة في أي حساب", points: 0 },
      { label: "مفعلة في حساب واحد أو حسابين", points: 4 },
      { label: "مفعلة على البريد والحسابات المالية", points: 8 },
      { label: "مفعلة على كل حساب مهم + رموز استعادة احتياطية محفوظة", points: 10 },
    ],
  },
  {
    id: "recovery",
    text: "طرق استعادة حساباتك (بريد احتياطي، رقم، رموز احتياطية):",
    dimension: "الاستعداد للاستعادة",
    options: [
      { label: "لا أعرف ما هي المسجلة أصلاً", points: 0 },
      { label: "قديمة وربما لا أملك الوصول لها الآن", points: 3 },
      { label: "محدّثة على الحسابات المهمة", points: 7 },
      { label: "محدّثة ومختبرة + رموز احتياطية بمعزل عن الجهاز", points: 10 },
    ],
  },
  {
    id: "updates",
    text: "تحديثات النظام والتطبيقات على هاتفك وحاسبك:",
    dimension: "أمن الأجهزة",
    options: [
      { label: "أؤجلها لأشهر أو لا أذكر آخر تحديث", points: 0 },
      { label: "أحدّث حين أتذكر", points: 4 },
      { label: "التحديث التلقائي مفعّل في أحدهما (جوال أو حاسب)", points: 7 },
      { label: "التحديث التلقائي مفعّل في الجهازين", points: 10 },
    ],
  },
  {
    id: "backups",
    text: "نسخك الاحتياطية للصور والمستندات المهمة:",
    dimension: "النسخ الاحتياطي",
    options: [
      { label: "لا توجد نسخ احتياطية", points: 0 },
      { label: "نسخة واحدة على نفس الجهاز أو قرص متصل دائماً", points: 3 },
      { label: "نسخة سحابية أو قرص خارجي دوري", points: 7 },
      { label: "قاعدة 3-2-1: نسخ متعددة إحداها معزولة واختبرت الاستعادة", points: 10 },
    ],
  },
  {
    id: "privacy",
    text: "إعدادات الخصوصية في حسابات التواصل:",
    dimension: "الخصوصية",
    options: [
      { label: "كل شيء عام ولم أراجعها أبداً", points: 0 },
      { label: "راجعتها مرة قبل سنوات", points: 4 },
      { label: "الحسابات للأصدقاء + صلاحيات الموقع مقيدة", points: 8 },
      { label: "مراجعة دورية + قيّدت المزامنة والموقع والتطبيقات المرتبطة", points: 10 },
    ],
  },
  {
    id: "phishing_awareness",
    text: "رسالة عاجلة من «بنكك» فيها رابط لتحديث بياناتك:",
    dimension: "الوعي بالتهديدات",
    options: [
      { label: "أفتح الرابط وأكمل إن كان الشكل مقنعاً", points: 0 },
      { label: "أتردد ثم ربما أكمل إن تكررت الرسالة", points: 3 },
      { label: "لا أفتح الرابط وأتحقق من تطبيق البنك", points: 8 },
      { label: "لا أفتحه + أتحقق رسمياً + أبلّغ عن الرسالة كتصيد", points: 10 },
    ],
  },
  {
    id: "device_lock",
    text: "قفل الشاشة على جوالك وحاسبك:",
    dimension: "أمن الأجهزة",
    options: [
      { label: "بدون قفل أو رمز بسيط جداً", points: 0 },
      { label: "رمز قصير على الجوال فقط", points: 4 },
      { label: "قفل قوي على الجوال", points: 7 },
      { label: "قفل قوي (بصمة/رمز طويل) على الجهازين مع تشفير مفعّل", points: 10 },
    ],
  },
  {
    id: "breach_hygiene",
    text: "عند سماعك عن تسريب يخص خدمة تستخدمها:",
    dimension: "الوعي بالتهديدات",
    options: [
      { label: "أتجاهل الخبر", points: 0 },
      { label: "أقرأ الخبر فقط", points: 3 },
      { label: "أغيّر كلمة مرور تلك الخدمة", points: 7 },
      { label: "أفحص بريدي بأداة التسريبات وأغيّر ما ظهر معادة الاستخدام", points: 10 },
    ],
  },
  {
    id: "otp_sharing",
    text: "شخص من «الدعم الفني» طلب رمز التحقق الذي وصلك الآن:",
    dimension: "حماية الحسابات",
    options: [
      { label: "أرسله إن بدا الموظف محترفاً", points: 0 },
      { label: "أرسله إن كان الطلب عن خدمة أستخدمها فعلاً", points: 2 },
      { label: "لا أرسله وأتجاهل", points: 7 },
      { label: "لا أرسله + أبلغ الجهة المنتحَلة عبر قناتها الرسمية", points: 10 },
    ],
  },
];

export const MAX_ASSESSMENT_SCORE = assessmentQuestions.reduce(
  (sum, q) => sum + Math.max(...q.options.map((o) => o.points)),
  0
);

const BANDS: { min: number; band: AssessmentResult["band"]; label: string }[] = [
  { min: 85, band: "strong", label: "قوي — التزام ممتاز بالأمن الرقمي" },
  { min: 65, band: "good", label: "جيد — قاعدة مستقرة مع تحسينات محدودة" },
  { min: 40, band: "fair", label: "متوسط — فجوات تستحق المعالجة قريباً" },
  { min: 0, band: "weak", label: "ضعيف — ابدأ بالخطوات الأساسية اليوم" },
];

export function scoreAssessment(
  answers: Record<string, number>
): AssessmentResult {
  let total = 0;
  const byDimension = new Map<string, { got: number; max: number }>();

  for (const q of assessmentQuestions) {
    const opt = q.options[answers[q.id] ?? 0];
    const got = opt ? opt.points : 0;
    const max = Math.max(...q.options.map((o) => o.points));
    total += got;
    const cur = byDimension.get(q.dimension) ?? { got: 0, max: 0 };
    cur.got += got;
    cur.max += max;
    byDimension.set(q.dimension, cur);
  }

  const percent = Math.round((total / MAX_ASSESSMENT_SCORE) * 100);
  const band = BANDS.find((b) => percent >= b.min) ?? BANDS[BANDS.length - 1]!;

  const strengths: string[] = [];
  const improvements: { dimension: string; advice: string }[] = [];

  const adviceMap: Record<string, string> = {
    "كلمات المرور": "ابدأ بمدير كلمات مرور واجعل كل حساب مهم بكلمة فريدة — ابدأ بالبريد ثم البنك",
    "حماية الحسابات": "فعّل المصادقة الثنائية عبر تطبيق مصادقة على البريد أولاً ثم الحسابات المالية",
    "الاستعداد للاستعادة": "راجع بريدك الاحتياطي ورقمك واحفظ رموز الاستعادة الاحتياطية خارج الجهاز",
    "أمن الأجهزة": "فعّل التحديث التلقائي وقفل شاشة قوياً على الجهازين، وثبّت من المتاجر الرسمية فقط",
    "النسخ الاحتياطي": "طبّق قاعدة 3-2-1: نسخة سحابية أو قرص خارجي أسبوعية تُفصل بعد النسخ",
    الخصوصية: "اجعل الحسابات للأصدقاء وقيد صلاحيات الموقع ومزامنة جهات الاتصال",
    "الوعي بالتهديدات": "أكمل درسي «كشف التصيد» و«التعرف على الاحتيال» في الأكاديمية وتدرّب على اختباراتهما",
  };

  for (const [dimension, { got, max }] of byDimension) {
    const ratio = got / max;
    if (ratio >= 0.8) {
      strengths.push(`${dimension}: أداؤك قوي (${got}/${max}) — حافظ عليه`);
    } else if (ratio < 0.6) {
      improvements.push({
        dimension,
        advice: adviceMap[dimension] ?? "راجع الدرس المرتبط في الأكاديمية",
      });
    }
  }

  improvements.sort((a, b) => {
    const ra = (byDimension.get(a.dimension)?.got ?? 0) / (byDimension.get(a.dimension)?.max ?? 1);
    const rb = (byDimension.get(b.dimension)?.got ?? 0) / (byDimension.get(b.dimension)?.max ?? 1);
    return ra - rb;
  });

  const sevenDayPlan = [
    "اليوم 1: تأمين البريد الإلكتروني — كلمة مرور فريدة جديدة + مصادقة ثنائية",
    "اليوم 2: مراجعة طرق الاستعادة على الحسابات المهمة وحفظ رموز احتياطية",
    "اليوم 3: تفعيل المصادقة الثنائية على الحسابات المالية وتطبيقات المراسلة",
    "اليوم 4: فحص البريد بأداة التسريبات وتغيير أي كلمة مرور معادة الاستخدام",
    "اليوم 5: تفعيل التحديث التلقائي وتثبيت مدير كلمات مرور",
    "اليوم 6: إعداد نسخة احتياطية تلقائية واختبار استعادتها",
    "اليوم 7: مراجعة إعدادات الخصوصية وإنجاء درسَي التصيد والاحتيال في الأكاديمية",
  ];

  return {
    totalScore: total,
    maxScore: MAX_ASSESSMENT_SCORE,
    percent,
    band: band.band,
    bandLabel: band.label,
    strengths,
    improvements,
    sevenDayPlan,
  };
}
