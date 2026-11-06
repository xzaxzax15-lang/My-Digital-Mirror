import { type ReactNode, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Icon } from "./ui";

const NAV = [
  { to: "/", label: "الرئيسية" },
  { to: "/report", label: "الإبلاغ الآمن" },
  { to: "/assistant", label: "مساعد الحوادث" },
  { to: "/ai", label: "المستشار الذكي" },
  { to: "/academy", label: "الأكاديمية" },
  { to: "/tools", label: "الأدوات" },
  { to: "/assessment", label: "الفحص الذاتي" },
  { to: "/countries", label: "الدول" },
  { to: "/resources", label: "الموارد" },
  { to: "/privacy", label: "الخصوصية" },
];

export function Layout({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href="#main" className="skip-link">الانتقال إلى المحتوى</a>
      <header className="site-header">
        <div className="container">
          <Link to="/" className="brand" aria-label="مرآتي الرقمية — الصفحة الرئيسية">
            <Icon name="shield" size={26} />
            مرآتي الرقمية
          </Link>
          <button
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "x" : "menu"} size={16} />
            {open ? "إغلاق" : "القائمة"}
          </button>
          <nav id="main-nav" className={`main-nav ${open ? "open" : ""}`} aria-label="التنقل الرئيسي">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={() => setOpen(false)}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main">{children ?? <Outlet />}</main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <p className="footer-title">مرآتي الرقمية</p>
            <p style={{ margin: 0, lineHeight: 1.9 }}>
              خدمة عربية مستقلة تساعدك على التعامل مع حوادث الأمن الرقمي: الدعم أثناء الحادثة،
              والتعلم قبلها، وأدوات تحترم خصوصيتك.
            </p>
          </div>
          <div>
            <p className="footer-title">عند الحاجة</p>
            <ul className="footer-list">
              <li><Link to="/report">الإبلاغ الآمن عن ابتزاز</Link></li>
              <li><Link to="/case">متابعة قضية</Link></li>
              <li><Link to="/tools">فحص كلمة مرور أو رابط</Link></li>
              <li><Link to="/resources">قنوات الإبلاغ الرسمية</Link></li>
            </ul>
          </div>
          <div>
            <p className="footer-title">الشفافية</p>
            <ul className="footer-list">
              <li><Link to="/trust">مركز الشفافية</Link></li>
              <li><Link to="/privacy">الخصوصية وحدود الخدمة</Link></li>
              <li><Link to="/admin">دخول المشرفين</Link></li>
            </ul>
          </div>
        </div>
        <div className="container footer-note">
          هذه الخدمة توعوية ومساعدة، ولا تُغني عن الجهات الرسمية المختصة. لا نطلب أبداً كلمات مرور
          أو رموز تحقق أو أرقام بطاقات، ولا نستطيع استرداد حسابات أو أموال نيابة عنك.
        </div>
      </footer>
    </>
  );
}
