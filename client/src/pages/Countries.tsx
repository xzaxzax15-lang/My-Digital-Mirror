import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CountryProfile, VerifyStatus } from "../../../shared/types";
import { api } from "../lib/api";
import { Alert, Card, EmptyState, ErrorState, Spinner } from "../components/ui";

const STATUS_LABEL: Record<VerifyStatus, { label: string; cls: string }> = {
  VERIFIED: { label: "مفحوص من المصدر", cls: "verified-tag" },
  PENDING_REVIEW: { label: "قيد التحقق من المصادر الرسمية", cls: "unverified-tag" },
  OUTDATED: { label: "بحاجة لتحديث", cls: "unverified-tag" },
  UNAVAILABLE: { label: "غير متاح حالياً", cls: "unverified-tag" },
  DISPUTED: { label: "متنازع عليه", cls: "unverified-tag" },
};

const REGION_ORDER = ["الخليج", "المشرق", "وادي النيل", "المغرب", "قرن أفريقيا"] as const;

export function CountriesPage() {
  const [countries, setCountries] = useState<CountryProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.countries().then((r) => setCountries(r.countries)).catch(() => setError("تعذر تحميل سجل الدول"));
  }, []);

  if (error) return <div className="container page"><ErrorState message={error} /></div>;
  if (!countries) return <div className="container page"><Spinner label="تحميل سجل الدول…" /></div>;

  const grouped = useMemo(() => {
    const map = new Map<string, CountryProfile[]>();
    for (const c of countries) {
      const arr = map.get(c.region) ?? [];
      arr.push(c);
      map.set(c.region, arr);
    }
    return map;
  }, [countries]);

  return (
    <div className="container page">
      <div className="page-header">
        <h1 className="page-title">شبكة الدول العربية</h1>
        <p className="page-subtitle">
          سجل لكل دولة عربية يوضح الجهات الرسمية المعنية بالأمن الرقمي وحالة التحقق منها. لا نضيف
          جهة أو رابطاً إلا بعد التحقق من مصدره الرسمي — ما لم يُفحص بعد يظهر بوضوح، ولا نعتبر
          غياب البيانات دليلاً على عدم وجود الجهة.
        </p>
      </div>

      <Alert kind="info">
        حالة التحقق تخص جهات كل دولة. الدول التي تظهر جهاتها «قيد التحقق» تعني أننا لم نُجزر فحص
        المصادر الرسمية بعد — سنكمل التحقق تدريجياً مع توثيق كل مصدر بتاريخه.
      </Alert>

      {[...grouped.entries()]
        .sort((a, b) => REGION_ORDER.indexOf(a[0] as never) - REGION_ORDER.indexOf(b[0] as never))
        .map(([region, list]) => (
          <div key={region}>
            <h2 className="section-title">{region}</h2>
            <div className="grid grid-3">
              {list.map((c) => {
                const verified = c.cert?.status === "VERIFIED";
                const hasData = Boolean(c.cert || c.cybercrime || c.childProtection);
                return (
                  <Link to={`/countries/${c.code}`} className="action-card" key={c.code}>
                    <h3>
                      {c.nameAr}{" "}
                      <span className="muted" dir="ltr" style={{ fontSize: "0.8rem" }}>{c.code}</span>
                    </h3>
                    {hasData ? (
                      <p>
                        {c.cert?.name ?? "جهات رسمية مسجلة"}{" "}
                        <span className={verified ? "verified-tag" : "unverified-tag"}>
                          · {STATUS_LABEL[verified ? "VERIFIED" : "PENDING_REVIEW"].label}
                        </span>
                      </p>
                    ) : (
                      <p className="muted">بيانات الجهات قيد جمعها من المصادر الرسمية</p>
                    )}
                    <span className="go">صفحة الدولة</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

export function CountryPage() {
  const { code } = useParams<{ code: string }>();
  const [country, setCountry] = useState<CountryProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    api.country(code).then((r) => setCountry(r.country)).catch(() => setError("تعذر تحميل بيانات هذه الدولة"));
  }, [code]);

  if (error) return <div className="container page"><ErrorState message={error} /></div>;
  if (!country) return <div className="container page"><Spinner label="تحميل صفحة الدولة…" /></div>;

  const Entity = ({ title, e }: { title: string; e?: CountryProfile["cert"] }) => (
    <Card style={{ marginBottom: 10 }}>
      <h3 className="card-title" style={{ fontSize: "0.98rem" }}>{title}</h3>
      {e?.name ? (
        <>
          <p className="card-text">{e.name}</p>
          {e.url && (
            <a className="btn btn-outline btn-sm" href={e.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 8 }}>
              الموقع الرسمي
            </a>
          )}
          <p className={e.status === "VERIFIED" ? "verified-tag" : "unverified-tag"} style={{ marginTop: 8 }}>
            {STATUS_LABEL[e.status].label}
            {e.verifiedAt ? ` — بتاريخ ${e.verifiedAt}` : ""}
            {e.source ? ` · ${e.source}` : ""}
          </p>
        </>
      ) : (
        <p className="muted">
          لم نتحقق بعد من الجهة المختصة في هذه الدولة من مصدرها الرسمي. لا نعرض أسماء أو روابط لم
          نتحقق منها — راجع قنوات الإبلاغ العامة في دليل الموارد إلى حين اكتمال التحقق.
        </p>
      )}
    </Card>
  );

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <Link to="/countries" className="muted" style={{ textDecoration: "none" }}>← كل الدول</Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h1 className="page-title">{country.nameAr} <span className="muted" dir="ltr" style={{ fontSize: "0.9rem" }}>({country.nameEn})</span></h1>
        <p className="page-subtitle">المنطقة: {country.region} · آخر مراجعة للسجل: {country.lastReviewed}</p>
      </div>

      <Entity title="الجهة الوطنية للأمن السيبراني / CERT" e={country.cert} />
      <Entity title="جهة مكافحة الجرائم الإلكترونية" e={country.cybercrime} />
      <Entity title="جهة حماية الطفل" e={country.childProtection} />

      <Card>
        <h3 className="card-title">إذا تعرضت للابتزاز في أي دولة — الخطوات المشتركة</h3>
        <ul className="list-plain" style={{ fontSize: "0.92rem" }}>
          <li>لا تدفع ولا تستجاب للمبتز، واحتفظ بالرسائل والأدلة دون حذفها</li>
          <li>أبلغ المنصة التي يحدث عبرها عن الحساب المسيء</li>
          <li>راجع صفحة «الإبلاغ الآمن» هنا لإنشاء قضية بمتابعة مشفرة</li>
          <li>للبلاغ الرسمي: راجع «القنوات الرسمية» في دليل الموارد، وجهة الدولة أعلاه إن كانت مفحوصة</li>
        </ul>
      </Card>

      <Alert kind="info">
        قوانين الجرائم الإلكترونية وإجراءات الإبلاغ تختلف من دولة لأخرى، ولا تقدم هذه الصفحة
        استشارة قانونية. للاستشارة القانونية راجع محامياً أو جهة رسمية في بلدك.
      </Alert>
    </div>
  );
}
