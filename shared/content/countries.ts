import type { CountryProfile, VerifyStatus } from "../types.js";

/**
 * سجل الدول العربية — 22 دولة.
 * قاعدة صارمة: لا تُملأ أي جهة أو رابط إلا بما هو منشور رسمياً وقابل للتحقق.
 * VERIFIED يعني فحصاً فعلياً بتاريخ موثق؛ كل ما عدا ذلك يبقى PENDING_REVIEW
 * ويُعرض للمستخدم بوضوح كبيانات "قيد التحقق من المصادر الرسمية".
 */
const P: VerifyStatus = "PENDING_REVIEW";

export const countries: CountryProfile[] = [
  {
    code: "BH", nameAr: "البحرين", nameEn: "Bahrain", region: "الخليج",
    cert: { name: "المركز الوطني للأمن السيبراني", url: "https://www.ncsc.gov.bh", status: "VERIFIED", verifiedAt: "2026-10-26", source: "فُحصت صفحة التوعية بأمان كلمات المرور على النطاق الرسمي" },
    lastReviewed: "2026-10-26",
  },
  {
    code: "SA", nameAr: "السعودية", nameEn: "Saudi Arabia", region: "الخليج",
    cert: { name: "الهيئة السعودية للأمن السيبراني", url: "https://cert.gov.sa", status: P },
    lastReviewed: "2026-10-26",
  },
  { code: "AE", nameAr: "الإمارات", nameEn: "United Arab Emirates", region: "الخليج", lastReviewed: "2026-10-26" },
  { code: "QA", nameAr: "قطر", nameEn: "Qatar", region: "الخليج", lastReviewed: "2026-10-26" },
  { code: "KW", nameAr: "الكويت", nameEn: "Kuwait", region: "الخليج", lastReviewed: "2026-10-26" },
  { code: "OM", nameAr: "عُمان", nameEn: "Oman", region: "الخليج", lastReviewed: "2026-10-26" },
  { code: "JO", nameAr: "الأردن", nameEn: "Jordan", region: "المشرق", lastReviewed: "2026-10-26" },
  { code: "LB", nameAr: "لبنان", nameEn: "Lebanon", region: "المشرق", lastReviewed: "2026-10-26" },
  { code: "PS", nameAr: "فلسطين", nameEn: "Palestine", region: "المشرق", lastReviewed: "2026-10-26" },
  { code: "SY", nameAr: "سوريا", nameEn: "Syria", region: "المشرق", lastReviewed: "2026-10-26" },
  { code: "IQ", nameAr: "العراق", nameEn: "Iraq", region: "المشرق", lastReviewed: "2026-10-26" },
  { code: "YE", nameAr: "اليمن", nameEn: "Yemen", region: "المشرق", lastReviewed: "2026-10-26" },
  { code: "EG", nameAr: "مصر", nameEn: "Egypt", region: "وادي النيل", lastReviewed: "2026-10-26" },
  { code: "SD", nameAr: "السودان", nameEn: "Sudan", region: "وادي النيل", lastReviewed: "2026-10-26" },
  { code: "LY", nameAr: "ليبيا", nameEn: "Libya", region: "المغرب", lastReviewed: "2026-10-26" },
  { code: "TN", nameAr: "تونس", nameEn: "Tunisia", region: "المغرب", lastReviewed: "2026-10-26" },
  { code: "DZ", nameAr: "الجزائر", nameEn: "Algeria", region: "المغرب", lastReviewed: "2026-10-26" },
  { code: "MA", nameAr: "المغرب", nameEn: "Morocco", region: "المغرب", lastReviewed: "2026-10-26" },
  { code: "MR", nameAr: "موريتانيا", nameEn: "Mauritania", region: "المغرب", lastReviewed: "2026-10-26" },
  { code: "SO", nameAr: "الصومال", nameEn: "Somalia", region: "قرن أفريقيا", lastReviewed: "2026-10-26" },
  { code: "DJ", nameAr: "جيبوتي", nameEn: "Djibouti", region: "قرن أفريقيا", lastReviewed: "2026-10-26" },
  { code: "KM", nameAr: "جزر القمر", nameEn: "Comoros", region: "قرن أفريقيا", lastReviewed: "2026-10-26" },
];

export const getCountry = (code: string): CountryProfile | undefined =>
  countries.find((c) => c.code.toUpperCase() === code.toUpperCase());
