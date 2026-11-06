// مكونات واجهة قابلة لإعادة الاستخدام — عربية RTL أولاً
import { type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from "react";

/* ---------- أيقونات SVG موحّدة (بديل الإيموجي) ---------- */
type IconName =
  | "shield" | "alert" | "check" | "x" | "arrow" | "search" | "lock"
  | "mail" | "link" | "clock" | "menu" | "book" | "clipboard" | "trash"
  | "eye" | "eyeOff" | "list" | "globe";

const PATHS: Record<IconName, ReactNode> = {
  shield: <path d="M12 2l7 3v6c0 4.4-3 8.4-7 11-4-2.6-7-6.6-7-11V5l7-3zM12 8v8M8.5 12h7" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  alert: <path d="M12 3l10 18H2L12 3zm0 7v5m0 3v.5" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  check: <path d="M4 12.5l5 5L20 6.5" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  x: <path d="M5 5l14 14M19 5L5 19" strokeWidth="2" fill="none" strokeLinecap="round" />,
  arrow: <path d="M19 12H5m6-7l-7 7 7 7" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  search: <path d="M10.5 3a7.5 7.5 0 105.2 12.9L21 21m-5.3-5.1A7.5 7.5 0 0010.5 3z" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  lock: <path d="M6 11h12v10H6V11zm3 0V7a3 3 0 016 0v4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  mail: <path d="M3 6h18v12H3V6zm0 0l9 7 9-7" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  link: <path d="M9 15l6-6m-7 2L6 11a4 4 0 015.7-5.7L12 6m0 7l2 2a4 4 0 01-5.7 5.7L7 19" strokeWidth="1.8" fill="none" strokeLinecap="round" />,
  clock: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v5l3.5 2" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.8" fill="none" strokeLinecap="round" />,
  book: <path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5zm15 13H6" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  clipboard: <path d="M9 4h6v3H9V4zm-1 1H6v16h12V5h-2M9 12h6m-6 4h4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  trash: <path d="M4 7h16M10 4h4m-7 3l1 14h8l1-14M10 11v6m4-6v6" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  eye: <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zm10 2.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  eyeOff: <path d="M4 4l16 16M9.9 5.2A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3 3.7M6.2 7.6A16 16 0 002 12s3.5 7 10 7c1.5 0 2.8-.3 4-.8" strokeWidth="1.8" fill="none" strokeLinecap="round" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="1.8" fill="none" strokeLinecap="round" />,
  globe: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm-9-9h18M12 3c-5 5.5-5 12.5 0 18m0-18c5 5.5 5 12.5 0 18" strokeWidth="1.6" fill="none" strokeLinecap="round" />,
};

export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---------- زر ---------- */
export function Button({
  variant = "primary",
  size,
  block,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "sm";
  block?: boolean;
}) {
  const v = variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : variant === "danger" ? "btn-danger" : "btn-outline";
  return (
    <button
      className={`btn ${v} ${size === "sm" ? "btn-sm" : ""} ${block ? "btn-block" : ""} ${className}`}
      {...rest}
    />
  );
}

/* ---------- بطاقة ---------- */
export function Card({ children, className = "", hover, style }: { children: ReactNode; className?: string; hover?: boolean; style?: CSSProperties }) {
  return <div className={`card ${hover ? "card-hover" : ""} ${className}`} style={style}>{children}</div>;
}

/* ---------- شارة ---------- */
export function Badge({ children, tone }: { children: ReactNode; tone?: "critical" | "high" | "medium" | "low" | "teal" }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ""}`}><span className="dot" aria-hidden="true" />{children}</span>;
}

/* ---------- تنبيه ---------- */
export function Alert({ kind = "info", children }: { kind?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === "danger" ? "alert" : "status"}>{children}</div>;
}

/* ---------- الحالات ---------- */
export function Spinner({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="state-box" role="status">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state-box">
      <p style={{ fontWeight: 700, color: "var(--ink-1)" }}>{title}</p>
      {hint && <p className="muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box" role="alert">
      <p style={{ fontWeight: 700, margin: 0 }}>تعذّر تحميل هذا القسم</p>
      <p style={{ margin: 0 }} className="muted">{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

const URGENCY: Record<string, { tone: "critical" | "high" | "medium" | "low"; label: string }> = {
  critical: { tone: "critical", label: "حالة طارئة" },
  high: { tone: "high", label: "أولوية عالية" },
  medium: { tone: "medium", label: "أولوية متوسطة" },
  low: { tone: "low", label: "أولوية عادية" },
};

export function UrgencyBadge({ urgency }: { urgency: "critical" | "high" | "medium" | "low" }) {
  const m = URGENCY[urgency] ?? URGENCY.low!;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/* زر خروج سريع — يستبدل الصفحة الحالية في سجل التصفح */
export function QuickExit() {
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      onClick={() => window.location.replace("https://www.google.com/search?q=%D8%A7%D9%84%D8%B7%D9%82%D8%B3")}
      title="يغلق هذه الصفحة ويستبدلها فوراً في سجل التصفح"
    >
      خروج سريع
    </button>
  );
}
