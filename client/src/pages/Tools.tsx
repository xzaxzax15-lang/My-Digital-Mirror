import { Link } from "react-router-dom";
import { Icon } from "../components/ui";

const TOOLS = [
  {
    to: "/tools/password",
    icon: "lock" as const,
    title: "قوة كلمة المرور",
    text: "يقيس قوة كلمة داخل متصفحك بالكامل — الكلمة نفسها لا تغادر جهازك ولا تُحفظ.",
  },
  {
    to: "/tools/breach",
    icon: "mail" as const,
    title: "تسريبات البريد",
    text: "هل ظهر بريدك في تسريبات معلنة؟ يُرسل بصمة مشفرة لا بريدك، ولا يُسجل أي شيء.",
  },
  {
    to: "/tools/link-check",
    icon: "link" as const,
    title: "فحص رابط أو رسالة",
    text: "يقرأ بنية الرابط وعلامات الخداع دون أن يفتح الوجهة أو يرسل نص رسالتك لأي جهة.",
  },
];

export function ToolsHubPage() {
  return (
    <div className="container page">
      <div className="page-header">
        <h1 className="page-title">الأدوات</h1>
        <p className="page-subtitle">
          ثلاث أدوات تعمل بمبدأ واحد: ما يمكن أن يجري في متصفحك لا يُرسل إلى خادمنا، وما يحتاج جهة
          خارجية يُوضح لك مسبقاً ماذا ترسل إليها بالضبط.
        </p>
      </div>
      <div className="grid grid-3">
        {TOOLS.map((t) => (
          <Link to={t.to} className="action-card" key={t.to}>
            <Icon name={t.icon} size={22} />
            <h3>{t.title}</h3>
            <p>{t.text}</p>
            <span className="go">افتح الأداة <Icon name="arrow" size={15} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
