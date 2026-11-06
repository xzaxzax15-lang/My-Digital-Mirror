import { useEffect, useMemo, useState } from "react";
import type { OfficialResource } from "../../../shared/types";
import { api } from "../lib/api";
import { Badge, Card, EmptyState, ErrorState, Icon, Spinner } from "../components/ui";

const KIND_LABELS: Record<OfficialResource["kind"], string> = {
  account_recovery: "استعادة حسابات",
  abuse_report: "الإبلاغ عن إساءة",
  cert: "جهات الاستجابة الوطنية",
  consumer: "حماية المستهلك",
  cybercrime: "الجرائم الإلكترونية",
  education: "مصادر تعليمية",
};

export function ResourcesPage() {
  const [resources, setResources] = useState<OfficialResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | OfficialResource["kind"]>("all");
  const [country, setCountry] = useState<string>("all");

  async function load() {
    setError(null);
    try {
      const r = await api.resources();
      setResources(r.resources);
    } catch {
      setError("تعذر تحميل قائمة الموارد");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const countries = useMemo(() => {
    if (!resources) return [];
    const set = new Map<string, string>();
    for (const r of resources) if (r.countryCode) set.set(r.countryCode, r.countryName ?? r.countryCode);
    return [...set.entries()].map(([code, name]) => ({ code, name }));
  }, [resources]);

  const visible = useMemo(() => {
    if (!resources) return [];
    return resources.filter(
      (r) => (kind === "all" || r.kind === kind) && (country === "all" || r.countryCode === country)
    );
  }, [resources, kind, country]);

  if (error) return <div className="container page"><ErrorState message={error} onRetry={load} /></div>;
  if (!resources) return <div className="container page"><Spinner label="تحميل الموارد…" /></div>;

  return (
    <div className="container page">
      <div className="page-header">
        <h1 className="page-title">القنوات الرسمية</h1>
        <p className="page-subtitle">
          روابط رسمية لاستعادة الحسابات والإبلاغ عن الجرائم الرقمية. كل رابط يعرض حالة التحقق منه
          كما هي — ما تم فحصه يظهر بتاريخه، وما لم يُفحص بعد يظهر بوضوح، ولا نعلّم رابطاً بـ«موثوق»
          إلا بعد فحص فعلي.
        </p>
      </div>

      <div className="filter-bar">
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label htmlFor="kind-filter">التصنيف</label>
          <select id="kind-filter" className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">كل التصنيفات</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label htmlFor="country-filter">الدولة</label>
          <select id="country-filter" className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="all">كل الدول والموارد العالمية</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="لا نتائج مطابقة" hint="جرّب تصنيفاً أو دولة أخرى" />
      ) : (
        <div className="grid grid-2">
          {visible.map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge tone="teal">{KIND_LABELS[r.kind]}</Badge>
                {r.countryName && <Badge>{r.countryName}</Badge>}
              </div>
              <h3 className="card-title" style={{ fontSize: "1rem" }}>{r.title}</h3>
              <p className="card-text" style={{ fontSize: "0.9rem" }}>{r.description}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <a className="btn btn-outline btn-sm" href={r.url} target="_blank" rel="noopener noreferrer">
                  فتح الموقع الرسمي
                  <Icon name="arrow" size={13} style={{ transform: "rotate(180deg)" }} />
                </a>
                {r.status === "verified" ? (
                  <span className="verified-tag">تم فحص الرابط: {r.verifiedAt}</span>
                ) : (
                  <span className="unverified-tag">لم يُفحص الرابط بعد</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="muted" style={{ marginTop: 22 }}>
        لا تجد بلدك؟ الإبلاغ المحلي يمر عادة عبر شرطة النجدة أو النيابة العامة أو بوابة وزارة
        الداخلية في بلدك. لا نضيف جهات لم نفحصها، وإن كانت لديك جهة رسمية تثق بها فأبلغ مشرفي
        المنصة لفحصها وإضافتها.
      </p>
    </div>
  );
}
