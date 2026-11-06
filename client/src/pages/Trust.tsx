import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Alert, Card, ErrorState, Spinner } from "../components/ui";

type Trust = Awaited<ReturnType<typeof api.trust>>;

export function TrustPage() {
  const [data, setData] = useState<Trust | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.trust().then(setData).catch(() => setError("تعذر تحميل الإحصاءات"));
  }, []);

  if (error) return <div className="container page"><ErrorState message={error} /></div>;
  if (!data) return <div className="container page"><Spinner label="تحميل الإحصاءات…" /></div>;

  const cards: { label: string; value: number | string; note?: string }[] = [
    { label: "قضايا أنشئت عبر الإبلاغ الآمن", value: data.casesTotal, note: "منها قضايا حُذفت بطلب أصحابها لا تظهر" },
    { label: "قضايا مصنفة طارئة", value: data.criticalCases, note: "قاصر أو خطر جسدي أو تهديد نشر مستمر" },
    { label: "أدلة رقمية مسجلة", value: data.evidenceCount, note: "بيانات وصفية فقط — لا ملفات" },
    { label: "دول في السجل", value: data.countriesTotal },
    { label: "دول جهاتها مفحوصة من المصدر", value: data.countriesVerified },
    { label: "دروس الأكاديمية", value: data.lessonsPublished },
    { label: "قنوات رسمية منشورة", value: data.resourcesPublished, note: `منها مفحوص الرابط: ${data.resourcesVerified}` },
    { label: "شراكات مؤسسية معتمدة", value: data.activePartnerships, note: "لا ندّعي شراكات قبل توقيع اتفاق رسمي" },
  ];

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">مركز الشفافية</h1>
        <p className="page-subtitle">
          أرقام المنصة كما هي — مجمعة ومجهولة الهوية بالكامل، بلا أسماء أو تفاصيل قضايا.
        </p>
      </div>

      <div className="grid grid-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "var(--navy-900)" }}>{c.value}</div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--ink-1)" }}>{c.label}</div>
            {c.note && <div className="muted" style={{ fontSize: "0.8rem" }}>{c.note}</div>}
          </Card>
        ))}
      </div>

      <Alert kind="info">{data.disclaimer}</Alert>

      <Card style={{ marginTop: 14 }}>
        <h3 className="card-title">التزاماتنا المعلنة</h3>
        <ul className="trust-list">
          <li>محادثات المساعد لا تُخزن أصلاً، وقضايا الإبلاغ محمية برمز متابعة مشفر يمكن لصاحبها حذفها نهائياً.</li>
          <li>لا تعرض لوحاتنا أي بيانات شخصية — إحصاءات مجمعة فقط.</li>
          <li>لا ندّعي شراكة أو اعتماداً من أي جهة دون اتفاق موقّع.</li>
          <li>روابط الموارد تعرض حالة فحصها الحقيقية بتاريخها.</li>
        </ul>
        <div style={{ marginTop: 10 }}>
          <Link to="/privacy" className="btn btn-outline btn-sm">سياسة الخصوصية الكاملة</Link>
        </div>
      </Card>
    </div>
  );
}
