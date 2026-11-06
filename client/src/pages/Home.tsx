import { Link } from "react-router-dom";
import { Icon } from "../components/ui";

const ACTIONS = [
  {
    to: "/assistant",
    icon: "alert" as const,
    title: "تصنع لي حادثة الآن؟",
    text: "صف ما حدث بجملة أو سطرين، وستحصل على خطوات مرتبة تناسب وضعك: ما تفعله الآن، ثم ما يأتي بعده.",
    go: "ابدأ الوصف",
  },
  {
    to: "/academy",
    icon: "book" as const,
    title: "أريد أن أفهم أكثر",
    text: "دروس قصيرة بالعربية عن التصيد وكلمات المرور والخصوصية، كل درس ينهي باختبار قصير وقائمة تطبيق.",
    go: "استعرض الدروس",
  },
  {
    to: "/assessment",
    icon: "clipboard" as const,
    title: "ما مستوى حمايتي؟",
    text: "عشرة أسئلة عن عاداتك الرقمية تظهر لك نقاط قوتك وما يستحق التعديل أولاً، مع خطة أسبوع عملية.",
    go: "ابدأ الفحص",
  },
];

const TOOLS = [
  { to: "/tools/password", icon: "lock" as const, title: "قوة كلمة المرور", text: "فحص داخل متصفحك فقط" },
  { to: "/tools/breach", icon: "mail" as const, title: "تسريبات بريدك", text: "يُرسل بصمة مشفرة لا بريدك" },
  { to: "/tools/link-check", icon: "link" as const, title: "فحص رابط مشبوه", text: "تحليل دون فتح الرابط" },
];

const PRINCIPLES = [
  "لا نلوم المتضرر ولا نحرجه — من يوقع بخدعة مبنية هو ضحية، لا طفل مبتدئ.",
  "لا نعد باسترداد مضمون ولا بحماية كاملة، ولا نعرض نتيجة فحص لم تتم فعلاً.",
  "لا نطلب كلمة مرور أو رمز تحقق أو رقم بطاقة، ولن يطلبها أي طرف موثوق مهما كانت الصيغة.",
  "الإرشادات مبنية على مصادر رسمية عندما تتوفر، ونقول بوضوح عندما لا يكون لدينا تحقق حديث.",
];

export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="hero-kicker">مرآتي الرقمية</p>
          <h1>حدث لك شيء مزعج على الإنترنت؟ لنمر عليه بهدوء.</h1>
          <p>
            هنا تجد خطوات عملية تتعامل بها مع الحسابات المخترقة والاحتيال والابتزاز الرقمي، وتتعلم
            كيف تقلل فرصة تكراره. كل شيء بالعربية، وبلا حساب، وباحترام كامل لخصوصيتك.
          </p>
          <div className="hero-actions">
            <Link to="/assistant" className="btn btn-primary">ساعدني في حادثة</Link>
            <Link to="/academy" className="btn btn-ghost">تعلّم السلامة الرقمية</Link>
          </div>
        </div>
      </section>

      <div className="container page">
        <div className="action-cards">
          {ACTIONS.map((a) => (
            <Link to={a.to} className="action-card" key={a.to}>
              <Icon name={a.icon} size={22} />
              <h3>{a.title}</h3>
              <p>{a.text}</p>
              <span className="go">
                {a.go}
                <Icon name="arrow" size={15} />
              </span>
            </Link>
          ))}
        </div>

        <h2 className="section-title">أدوات سريعة</h2>
        <div className="mini-list">
          {TOOLS.map((t) => (
            <Link to={t.to} className="mini-row" key={t.to}>
              <span className="mini-icon"><Icon name={t.icon} size={20} /></span>
              <div>
                <b>{t.title}</b>
                <span>{t.text}</span>
              </div>
            </Link>
          ))}
        </div>

        <h2 className="section-title">كيف نتعامل معك</h2>
        <div className="grid grid-2">
          <ul className="trust-list" style={{ fontSize: "0.95rem" }}>
            {PRINCIPLES.map((p, i) => (
              <li key={i}><span className="tick"><Icon name="check" size={15} /></span>{p}</li>
            ))}
          </ul>
          <div>
            <p style={{ color: "var(--ink-2)", margin: 0, fontSize: "0.95rem" }}>
              خدمة مستقلة لا تديرها أي منصة أو جهة حكومية. نحن هنا لنساعدك على فهم ما حدث واتخاذ
              الخطوات الصحيحة، ونوجّهك للقنوات الرسمية عند الحاجة إليها — من دون أن نستبدل بها.
              إن تعرضت لتهديد جسدي، فاتصل بالطوارئ في بلدك أولاً؛ الأمان الشخصي يسبق أي شيء آخر.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
