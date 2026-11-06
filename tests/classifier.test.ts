import { describe, expect, it } from "vitest";
import {
  assessUrgency,
  classifyIncident,
  detectControlStatus,
  hasDistress,
  hasEmergency,
  inCyberScope,
  involvesMinor,
  normalizeArabic,
} from "../server/services/classifier.js";
import { allPlaybooks } from "../shared/content/playbooks-index.js";

describe("تطبيع النص العربي", () => {
  it("يوحّد الألف والهمزات والتاء المربوطة", () => {
    expect(normalizeArabic("أحمد إبراهيم آمنة فاطمة")).toBe(normalizeArabic("احمد ابراهيم امنه فاطمه"));
  });
  it("يزيل التشكيل", () => {
    expect(normalizeArabic("اخْتِرَاق")).toBe("اختراق");
  });
});

describe("فحص النطاق", () => {
  it("يقبل رسائل الأمن السيبراني", () => {
    expect(inCyberScope("حسابي انسرق ماذا أفعل؟")).toBe(true);
    expect(inCyberScope("وصلني رمز تحقق غريب")).toBe(true);
  });
  it("يرفض المواضيع الخارجة عن النطاق", () => {
    expect(inCyberScope("ما هي أفضل وصفة كيك؟")).toBe(false);
    expect(inCyberScope("من فاز بالمباراة أمس؟")).toBe(false);
  });
});

describe("تصنيف الحوادث", () => {
  const cases: [string, string][] = [
    ["حسابي في انستقرام انسرق وما أقدر أدخل", "social_account_takeover"],
    ["بريدي في جيميل اخترق ولا تصلني رسائلي", "email_compromise"],
    ["واتساب انتقل لجهاز ثاني وما عاد عندي", "messaging_takeover"],
    ["حسابي فيسبوك محظور وأبي أعترض", "account_ban"],
    ["وصلة رسالة من البنك فيها رابط وأدخلت بياناتي", "phishing"],
    ["شخص عمل حساب باسمي على انستقرام", "impersonation"],
    ["دفعت لمتجر انترنت وما وصل الطلب", "shopping_scam"],
    ["حولت فلوس لاستثمار بيتكوين وانصبوا علي", "financial_fraud"],
    ["ملفاتي كلها انقفلت وطلبوا فلوس لفك التشفير", "ransomware"],
    ["جهازي صار بطيء وتطلع لي إعلانات غريبة", "suspected_malware"],
    ["أشك أن شخص يقرأ رسائلي ويتجسس على جهازي", "device_compromise"],
    ["شريحتي انقطعت فجأة والشبكة راحت", "sim_swap"],
    ["شخص يرسل لي تهديدات ويعرف عنواني ويتابعني", "stalking_doxxing"],
    ["مجموعة من المدرسة يتنمرون علي ويسبوني", "cyberbullying"],
    ["شخص يبتزني بصور وطلب فلوس", "sextortion"],
    ["شريكي السابق يهددني بنشر صور خاصة", "intimate_image_threat"],
    ["وصلني إيميل محاولة دخول من جهاز لا أعرفه", "suspicious_login"],
    ["قرأت أن بياناتي انسربت من موقع", "data_exposure"],
    ["وصلني رابط مشبوه ما أدري أفتحه أو لا", "suspicious_link_file"],
  ];

  for (const [text, expectedId] of cases) {
    it(`يصنف: «${text}» → ${expectedId}`, () => {
      const c = classifyIncident(text);
      expect(c.best?.id).toBe(expectedId);
    });
  }

  it("كل الأدلة لها معرفات فريدة", () => {
    const ids = allPlaybooks.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("الاستعجال", () => {
  const pb = allPlaybooks.find((p) => p.id === "social_account_takeover")!;
  it("يرفع إلى حرجة عند طلب المال من الأصدقاء", () => {
    const r = assessUrgency("حسابي انسرق وطلبوا من أصحابي فلوس", pb);
    expect(r.urgency).toBe("critical");
  });
  it("يبقي الافتراضي للحادثة العادية", () => {
    expect(pb.defaultUrgency).toBe("high");
  });
});

describe("الخطر الجسدي", () => {
  it("يكشف عبارات الخطر الجسدي", () => {
    expect(hasEmergency("قال راته جاي البيت يضربني")).toBe(true);
    expect(hasEmergency("وصلني ايميل غريب")).toBe(false);
  });
});

describe("حالة التحكم", () => {
  it("يكشف فقدان الوصول", () => {
    expect(detectControlStatus("ما أقدر أدخل للحساب")).toBe("lost_control");
  });
  it("يكشف امتلاك الوصول", () => {
    expect(detectControlStatus("قدرت أدخل وغيرت كلمة المرور")).toBe("has_control");
  });
});

describe("القاصرين", () => {
  it("يكشف ذكر قاصر", () => {
    expect(involvesMinor("الموضوع فيه طفل عمره ١٥")).toBe(true);
    expect(involvesMinor("أنا رجل كبير")).toBe(false);
  });
});

describe("الانزعاج النفسي", () => {
  it("يكشف عبارات الضيق الشديد", () => {
    expect(hasDistress("والله تعبت من الحياة")).toBe(true);
  });
});
