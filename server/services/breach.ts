import type { BreachResult } from "../../shared/types.js";
import { logWarn } from "../security.js";

/**
 * فحص تسريبات البريد — عبر Have I Been Pwned.
 * الخصوصية: العميل يحسب SHA-1 للبريد محلياً ويرسل الهاش فقط.
 * الخادم لا يسجل الهاش ولا يستخدمه في أي مكان غير الطلب.
 * بدون مفتاح API تعمل الأداة بحالة «غير متاحة» بصدق — لا نتائج وهمية أبداً.
 */

const ARABIC_DATA_CLASSES: Record<string, string> = {
  "Email addresses": "عناوين البريد الإلكتروني",
  "Password hints": "تلميحات كلمات المرور",
  Passwords: "كلمات المرور (مشفرة أو مكشوفة)",
  "Usernames": "أسماء المستخدمين",
  "Names": "الأسماء",
  "Phone numbers": "أرقام الهواتف",
  "Physical addresses": "العنوان الفيزيائي",
  "Dates of birth": "تواريخ الميلاد",
  "Genders": "الجنس",
  "IP addresses": "عناوين IP",
  "Geographic locations": "الموقع الجغرافي",
  "Social relationships": "العلاقات الاجتماعية",
  "Profile photos": "صور الملف الشخصي",
  "Security questions and answers": "أسئلة وأجوبة الأمان",
  "Credit cards": "بطاقات الائتمان (جزئية عادة)",
  "Bank account numbers": "أرقام الحسابات البنكية",
  "Chat logs": "سجلات المحادثات",
  "Email messages": "رسائل البريد",
  "Employers": "جهات العمل",
  "Job titles": "المسميات الوظيفية",
  "Salaries": "الرواتب",
  "Purchases": "المشتريات",
  "Payment histories": "سجل المدفوعات",
  "Website activity": "نشاط التصفح",
  "Auth tokens": "رموز الجلسات",
  "Session data": "بيانات الجلسات",
  "Device information": "معلومات الأجهزة",
  "Historical passwords": "كلمات مرور قديمة",
  "Partial credit card data": "بيانات بطاقة جزئية",
  "Partial dates of birth": "تواريخ ميلاد جزئية",
  "Partial phone numbers": "أرقام هواتف جزئية",
  "Avatar URLs": "روابط الصور",
  "Bios": "نبذ تعريفية",
  "Tokens": "رموز وصول",
};

export interface HibpBreach {
  Name: string;
  Title?: string;
  BreachDate?: string;
  DataClasses?: string[];
  Verified?: boolean;
  PwnCount?: number;
}

const DISCLOSURE =
  "آلية الفحص: يتحول بريدك إلى بصمة SHA-1 داخل متصفحك، وتُرسل البصمة وحدها إلى خدمة Have I Been Pwned للتحقق من التسريبات المعلنة. لا نحفظ البريد ولا البصمة ولا نسجل الفحص، ولا يُرسل بريدك إلى أي طرف آخر.";

export async function checkBreaches(
  apiKey: string | undefined,
  emailSha1Upper: string
): Promise<BreachResult> {
  if (!apiKey) {
    return {
      status: "unavailable",
      breaches: [],
      disclaimer: "فحص التسريبات غير مفعّل حالياً لأنه يحتاج مفتاح مزود مدفوع. لا نعرض نتائج تقديرية بدلاً من الفحص الحقيقي — يمكنكم مراجعة قنوات التأمين العامة أدناه.",
      providerDisclosure: DISCLOSURE,
    };
  }
  if (!/^[A-F0-9]{40}$/.test(emailSha1Upper)) {
    return {
      status: "unavailable",
      breaches: [],
      disclaimer: "بصمة البريد غير صالحة — أعد المحاولة من الصفحة.",
      providerDisclosure: DISCLOSURE,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(emailSha1Upper)}?truncateResponse=false`,
      {
        signal: controller.signal,
        headers: {
          "hibp-api-key": apiKey,
          "User-Agent": "DigitalMirrorAwarenessPlatform",
        },
      }
    );
    if (res.status === 404) {
      return {
        status: "not_found",
        breaches: [],
        disclaimer:
          "لم يظهر هذا البريد في التسريبات المعلنة المتاحة لدى المزود. هذا مطمئن جزئياً فقط — قد يكون ضمن تسريبات لم تُعلن أو لم تُفهرس بعد.",
        providerDisclosure: DISCLOSURE,
      };
    }
    if (res.status === 401 || res.status === 403) {
      logWarn("hibp_auth_error", { status: res.status });
      return {
        status: "unavailable",
        breaches: [],
        disclaimer: "تعذر الاتصال بخدمة الفحص بسبب مشكلة في صلاحية الوصول للمزود. جرّب بعد فترة، والتقييم في الخطوات أدناه يبقى مفيداً.",
        providerDisclosure: DISCLOSURE,
      };
    }
    if (res.status === 429) {
      return {
        status: "unavailable",
        breaches: [],
        disclaimer: "وصلنا إلى الحد المسموح من الطلبات مؤقتاً — انتظر دقيقة ثم أعد المحاولة.",
        providerDisclosure: DISCLOSURE,
      };
    }
    if (!res.ok) {
      logWarn("hibp_error", { status: res.status });
      return {
        status: "unavailable",
        breaches: [],
        disclaimer: "خدمة الفحص غير متاحة الآن. غياب النتيجة ليس دليلاً على أي شيء — جرّب بعد قليل.",
        providerDisclosure: DISCLOSURE,
      };
    }
    const data = (await res.json()) as HibpBreach[];
    const breaches = data.map((b) => ({
      name: b.Title ?? b.Name,
      breachDate: b.BreachDate ?? "غير معروف",
      exposedDataKinds: (b.DataClasses ?? []).map((d) => ARABIC_DATA_CLASSES[d] ?? d),
      verified: b.Verified ?? false,
    }));
    return {
      status: "found",
      breaches,
      disclaimer:
        breaches.length > 0
          ? `ظهر البريد في ${breaches.length} تسريباً معلناً. وجوده هنا يعني تسرب بيانات فعلي من تلك الخدمة، مع أن القاعدة لا تغطي كل تسريب حدث.`
          : "لم تُعثر نتائج.",
      providerDisclosure: DISCLOSURE,
    };
  } catch (e) {
    logWarn("hibp_request_failed", { error: e instanceof Error ? e.constructor.name : "unknown" });
    return {
      status: "unavailable",
      breaches: [],
      disclaimer: "تعذر الوصول لخدمة الفحص بسبب مشكلة في الشبكة. غياب النتيجة ليس دليلاً على أمان البريد.",
      providerDisclosure: DISCLOSURE,
    };
  } finally {
    clearTimeout(timer);
  }
}
