import type { VideoItem } from "../types.js";

/**
 * مكتبة الفيديو — لا يُدرج هنا إلا ما تم التحقق من وجوده فعلياً.
 * verifiedAt = تاريخ التحقق الفعلي من الرابط.
 */
export const videoLibrary: VideoItem[] = [
  {
    id: "intro-cybersecurity-ar-playlist",
    title: "مقدمة في الأمن السيبراني (بالعربية) — قائمة تشغيل تعليمية",
    source: "YouTube — قائمة تشغيل تعليمية مجتمعية بالعربية",
    url: "https://www.youtube.com/playlist?list=PLdUDP-atVHBpsvwINVbfbPAasnQnuCxGk",
    difficulty: "beginner",
    topic: "أساسيات الأمن السيبراني",
    captionsAr: false,
    status: "published",
    verifiedAt: "2026-10-26",
    note: "قائمة دروس مرئية بالعربية للمبتدئين. تحققنا من وجود الرابط بتاريخ الفحص المذكور. هذا محتوى تعليمي مجتمعي — قارنه بالدروس الرسمية في الأكاديمية ولا تعتمد عليه وحده.",
  },
];
