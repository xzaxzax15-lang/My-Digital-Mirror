import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { dictionary as commonDict, adjacencyGraphs as commonGraphs } from "@zxcvbn-ts/language-common";
import { dictionary as enDict, translations as enTranslations } from "@zxcvbn-ts/language-en";
import { sha1Upper } from "../../lib/api";
import { Alert, Button, Card, Icon } from "../../components/ui";

const SCORE_LABELS = ["سهلة التخمين جداً", "ضعيفة", "مقبولة فقط", "جيدة", "قوية"];

function crackRanges(guesses: number): string {
  // نطاقات واسعة بفرضيات معلنة — ليست تنبؤاً
  const onlineThrottled = guesses / 100 / 3600;
  const offlineSlow = guesses / 1e10 / 3600;
  const offlineFast = guesses / 1e12 / 3600;
  const fmt = (hours: number): string => {
    if (hours < 1 / 60) return "ثوانٍ";
    if (hours < 1) return "دقائق";
    if (hours < 24) return "ساعات";
    if (hours < 24 * 31) return "أيام";
    if (hours < 24 * 365) return "أشهر";
    if (hours < 24 * 365 * 100) return "سنوات";
    if (hours < 24 * 365 * 1e6) return "قرون";
    return "زمن غير عملي للمهاجم";
  };
  return `محاولات دخول عبر الإنترنت: ${fmt(onlineThrottled)} · كسر تجزئة بطيئة دون اتصال: ${fmt(offlineSlow)} · تجزئة سريعة: ${fmt(offlineFast)}`;
}

let zxcvbnReady = false;
function ensureZxcvbn() {
  if (!zxcvbnReady) {
    zxcvbnOptions.setOptions({
      dictionary: { ...commonDict, ...enDict },
      graphs: commonGraphs,
      translations: enTranslations,
    });
    zxcvbnReady = true;
  }
}

const WARN_AR: Record<string, string> = {
  "This is a top-10 common password": "من أشهر عشر كلمات مرور في العالم — أول ما يُجرّب في أي هجوم",
  "This is a top-100 common password": "من أشهر مئة كلمة مرور",
  "This is a very common password": "كلمة شائعة جداً في قوائم الاختراق",
  "This is similar to a commonly used password": "قريبة جداً من كلمة مرور شائعة",
  "A word by itself is easy to guess": "كلمة واحدة وحدها سهلة التخمين",
  "Names and surnames by themselves are easy to guess": "الأسماء وحدها سهلة التخمين",
  "Common names and surnames are easy to guess": "الأسماء الشائعة سهلة التخمين",
  "Dates are often easy to guess": "التواريخ من أول ما يُجرّب",
  "Recent years are easy to guess": "السنوات الحديثة شائعة جداً",
  "Repeats like 'aaa' are easy to guess": "التكرار المتتالي لا يزيد القوة",
  "Repeats like 'abcabcabc' are only slightly harder to guess than 'abc'": "تكرار نمط لا يزيد القوة فعلياً",
  "Sequences like abc or 6543 are easy to guess": "التسلسلات المتوقعة سهلة التخمين",
  "All-uppercase is almost as easy to guess as all-lowercase": "الحروف الكبيرة كلها لا تغير شيئاً يُذكر",
};
const SUGG_AR: Record<string, string> = {
  "Add another word or two. Uncommon words are better.": "أضف كلمة أو كلمتين غير متوقعتين",
  "Use a longer keyboard pattern with more turns": "ابتعد عن أنماط لوحة المفاتيح المتوقعة",
  "Avoid dates and years that are associated with you": "تجنب التواريخ المرتبطة بك شخصياً",
  "Avoid recent years": "تجنب السنوات الحديثة",
  "Capitalization doesn't help very much": "تغيير حالة الحروف وحده لا يساعد",
  "Reversed words aren't much harder to guess": "الكلمة المعكوسة ليست أصعب",
  "Use words, avoid sequences": "استخدم كلمات وتجنب التسلسلات",
  "Predictable substitutions like '@' instead of 'a' don't help very much": "الاستبدال المتوقع مثل @ بدل a لا يساعد كثيراً",
};
const ar = (en: string, map: Record<string, string>): string => map[en] ?? en;

async function checkPwnedRange(password: string): Promise<number | null> {
  try {
    const hash = await sha1Upper(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix) return Number(count);
    }
    return 0;
  } catch {
    return null;
  }
}

export function PasswordCheckerPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pwnedEnabled, setPwnedEnabled] = useState(false);
  const [pwnedCount, setPwnedCount] = useState<number | null | undefined>(undefined);

  ensureZxcvbn();
  const result = useMemo(() => (password ? zxcvbn(password) : null), [password]);

  useEffect(() => {
    setPwnedCount(undefined);
    if (!pwnedEnabled || password.length < 1) return;
    const t = setTimeout(async () => {
      setPwnedCount(await checkPwnedRange(password));
    }, 600);
    return () => clearTimeout(t);
  }, [password, pwnedEnabled]);

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <Link to="/tools" className="muted" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="arrow" size={14} /> كل الأدوات
      </Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h1 className="page-title">قوة كلمة المرور</h1>
        <p className="page-subtitle">
          الفحص يجري داخل متصفحك بالكامل. الكلمة لا تُرسل إلى خادمنا ولا لأي جهة، ولا تُحفظ في أي
          مكان — حتى تاريخ الكتابة لا يبقى لها أثر بعد إغلاق الصفحة.
        </p>
      </div>

      <Card>
        <div className="field">
          <label htmlFor="pw">اكتب كلمة مرور لتجربتها</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="pw"
              className="input"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="اكتب هنا…"
              autoComplete="off"
              dir="auto"
            />
            <Button variant="outline" onClick={() => setShow(!show)} aria-pressed={show} title={show ? "إخفاء" : "إظهار"}>
              <Icon name={show ? "eyeOff" : "eye"} size={16} />
            </Button>
            <Button variant="danger" onClick={() => { setPassword(""); setPwnedCount(undefined); }}>
              مسح
            </Button>
          </div>
          <span className="hint">
            بعد الانتهاء اضغط «مسح». الحقل معطّل عن الحفظ في المتصفح، ولا نحتفظ بأي نسخة أصلاً.
          </span>
        </div>

        {result && (
          <div className={`strength-${result.score}`}>
            <div className="meter" role="meter" aria-valuenow={result.score} aria-valuemin={0} aria-valuemax={4} aria-label="قوة كلمة المرور">
              <div className="meter-fill" />
            </div>
            <p style={{ fontWeight: 800, margin: "10px 0 4px", fontSize: "1.05rem" }}>
              {SCORE_LABELS[result.score]}
            </p>
            {result.score <= 2 && (
              <p style={{ color: "var(--danger-700)", margin: 0, fontWeight: 700 }}>
                لا ننصح باستخدامها لأي حساب مهم — البريد والحسابات المالية يستحقان أفضل من هذا بكثير.
              </p>
            )}
            <p className="muted" style={{ margin: "10px 0 0" }}>
              {crackRanges(result.guesses)}
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              هذه أرقام تقريبية من نموذج إحصائي وفرضيات مذكورة أعلاه. الزمن الحقيقي يعتمد على طريقة
              المهاجم، وطريقة تشفير الخدمة لكلمة المرور، وهل الكلمة معاد استخدامها أو مسرّبة سابقاً.
            </p>
            {result.feedback.warning && (
              <Alert kind="warn">{ar(result.feedback.warning, WARN_AR)}</Alert>
            )}
            {result.feedback.suggestions.filter(Boolean).length > 0 && (
              <ul className="list-plain" style={{ marginTop: 10 }}>
                {result.feedback.suggestions.filter(Boolean).map((s, i) => (
                  <li key={i} className="muted">· {ar(s, SUGG_AR)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <hr className="divider" />
        <div className="field">
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={pwnedEnabled}
              onChange={(e) => setPwnedEnabled(e.target.checked)}
              style={{ marginTop: 5 }}
            />
            <span>
              فحص إضافي: هل ظهرت هذه الكلمة في تسريبات معروفة؟
              <span className="hint" style={{ display: "block" }}>
                عند التفعيل يُرسل أول خمسة أحرف من بصمة SHA-1 للكلمة إلى خدمة api.pwnedpasswords.com
                وفق بروتوكول مصمم لهذا الغرض — الكلمة نفسها وبصمتها الكاملة لا تخرجان من جهازك. إن
                تعذر الوصول للخدمة يفشل هذا الفحص بصمت ولا يؤثر على التقييم المحلي أعلاه.
              </span>
            </span>
          </label>
        </div>
        {pwnedEnabled && pwnedCount !== undefined && (
          pwnedCount === null ? (
            <Alert kind="warn">تعذر الوصول لخدمة الفحص الآن — التقييم المحلي أعلاه يبقى صالحاً.</Alert>
          ) : pwnedCount > 0 ? (
            <Alert kind="danger">
              ظهرت هذه الكلمة في تسريبات معروفة {pwnedCount.toLocaleString("en")} مرة. اعتبرها خارج
              الخدمة نهائياً ولا تستخدمها في أي حساب.
            </Alert>
          ) : (
            <Alert kind="info">
              لم تظهر في قاعدة التسريبات المفهرسة. هذا مطمئن جزئياً فقط، وليس ضماناً — القاعدة لا
              تشمل كل تسريب حدث في العالم.
            </Alert>
          )
        )}
      </Card>

      <Alert kind="info">
        الأفضل عملياً: برنامج إدارة كلمات مرور موثوق يولّد كلمة مختلفة لكل حساب، وأنت تحفظ عبارة
        رئيسية واحدة طويلة فقط.
      </Alert>
    </div>
  );
}
