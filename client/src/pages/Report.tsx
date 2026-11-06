import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CaseCreated, ReportSubmission } from "../../../shared/types";
import { api } from "../lib/api";
import { Alert, Button, Card, Icon, QuickExit, UrgencyBadge } from "../components/ui";

const STEPS = ["ماذا حدث", "وضعك الآن", "المراجعة والموافقة"];

export function ReportPage() {
  const [step, setStep] = useState(0);
  const [playbooks, setPlaybooks] = useState<{ id: string; title: string; category: string }[]>([]);
  const [countries, setCountries] = useState<{ code: string; nameAr: string }[]>([]);
  const [incidentType, setIncidentType] = useState("");
  const [ongoing, setOngoing] = useState(true);
  const [publicationThreat, setPublicationThreat] = useState(false);
  const [minorInvolved, setMinorInvolved] = useState(false);
  const [physicalRisk, setPhysicalRisk] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [summary, setSummary] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CaseCreated | null>(null);

  useEffect(() => {
    api.playbooks().then((r) => setPlaybooks(r.playbooks)).catch(() => {});
    api.countries().then((r) => setCountries(r.countries.map((c) => ({ code: c.code, nameAr: c.nameAr })))).catch(() => {});
  }, []);

  const urgent = minorInvolved || physicalRisk;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const submission: ReportSubmission = {
        incidentType: incidentType || "other",
        ongoing,
        publicationThreat,
        minorInvolved,
        physicalRisk,
        countryCode: countryCode || undefined,
        consentStore: true,
        summary: summary.trim() || undefined,
      };
      setCreated(await api.reportCase(submission));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إنشاء البلاغ");
    } finally {
      setBusy(false);
    }
  }

  // شاشة النجاح — الرمز يعرض مرة واحدة فقط
  if (created) {
    return (
      <div className="container page" style={{ maxWidth: 680 }}>
        <Alert kind="ok">
          أنشأنا قضيتك. احفظ الرقمين أدناه الآن — رمز المتابعة يُعرض هذه المرة فقط ولا يمكن
          استرجاعه إذا فقده، لأنه يُخزن مشفراً ولا نملك نسخة منه.
        </Alert>
        <Card style={{ marginTop: 14 }}>
          <div className="field">
            <label>رقم القضية</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code dir="ltr" style={{ fontSize: "1.2rem", fontWeight: 700 }}>{created.caseNumber}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(created.caseNumber)}>نسخ</Button>
            </div>
          </div>
          <div className="field">
            <label>رمز المتابعة (سري — لا تشاركه مع أحد)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code dir="ltr" style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--danger-700)" }}>{created.followupCode}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(created.followupCode)}>نسخ</Button>
            </div>
          </div>
          <ul className="trust-list">
            <li><span className="tick"><Icon name="check" size={14} /></span>صوّر الشاشة أو اكتب الرقمين في مكان آمن خارج هذا الجهاز إن كان مشتركاً.</li>
            <li><span className="tick"><Icon name="check" size={14} /></span>الرمز هو مفتاحك الوحيد لمتابعة القضية وإضافة الأدلة وحذفها.</li>
            <li><span className="tick"><Icon name="check" size={14} /></span>البلاغ لا يُرسل تلقائياً لأي جهة — لا شيء يخرج من المنصة دون موافقتك المنفصلة.</li>
          </ul>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Link to="/case" className="btn btn-primary">متابعة القضية</Link>
            <QuickExit />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container page" style={{ maxWidth: 680 }}>
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h1 className="page-title">الإبلاغ الآمن</h1>
            <p className="page-subtitle">
              بلاغ من دون حساب ومن دون اسم. لا نطلب هوية ولا رقم هاتف، والبلاغ لا يُرسل لأي جهة
              خارجية إلا بموافقتك المنفصلة لاحقاً.
            </p>
          </div>
          <QuickExit />
        </div>
      </div>

      {urgent && (
        <Alert kind="danger">
          بما أن <strong>{physicalRisk ? "هناك خطر جسدي" : "الضحية قاصر"}</strong>: تواصل الآن مع
          طوارئ بلدك أو جهة حماية الطفل قبل أي شيء آخر. هذا البلاغ الإلكتروني لا يصل للطوارئ.
        </Alert>
      )}

      <div className="track-tabs" role="tablist" aria-label="خطوات البلاغ">
        {STEPS.map((s, i) => (
          <span key={s} className="chip" style={i === step ? { background: "var(--teal-600)", color: "#fff", borderColor: "var(--teal-600)" } : { cursor: "default" }}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <div className="field">
            <label>أي مما يلي يوصف ما حدث بشكل أدق؟</label>
            <div style={{ display: "grid", gap: 8 }}>
              {playbooks.map((p) => (
                <label key={p.id} className="quiz-option" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="incident"
                    checked={incidentType === p.id}
                    onChange={() => setIncidentType(p.id)}
                  />
                  <span>{p.title}</span>
                </label>
              ))}
              <label className="quiz-option" style={{ cursor: "pointer" }}>
                <input type="radio" name="incident" checked={incidentType === "other"} onChange={() => setIncidentType("other")} />
                <span>حادثة أخرى أو لست متأكداً</span>
              </label>
            </div>
          </div>
          <Button block disabled={!incidentType} onClick={() => setStep(1)}>التالي</Button>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="field">
            <label>حدد ما ينطبق على وضعك (اتركها فارغة إن لا تنطبق)</label>
            <label className="quiz-option" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
              <span>الابتزاز أو التهديد مستمر الآن</span>
            </label>
            <label className="quiz-option" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={publicationThreat} onChange={(e) => setPublicationThreat(e.target.checked)} />
              <span>هناك تهديد بنشر صور أو معلومات</span>
            </label>
            <label className="quiz-option" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={minorInvolved} onChange={(e) => setMinorInvolved(e.target.checked)} />
              <span>الضحية قاصر (أقل من 18)</span>
            </label>
            <label className="quiz-option" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={physicalRisk} onChange={(e) => setPhysicalRisk(e.target.checked)} />
              <span>هناك خطر جسدي أو تهديد مباشر بالأذى</span>
            </label>
          </div>
          <Alert kind="info">
            لا تكتب في أي مكان هنا: اسمك الحقيقي، رقم هاتفك، رقم هويتك، كلمات المرور، أو رموز
            التحقق. المنصة لا تحتاجها، ومن يطلبها منك باسمها فهو محتال.
          </Alert>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="outline" onClick={() => setStep(0)}>رجوع</Button>
            <Button block onClick={() => setStep(2)}>التالي</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="field">
            <label>دولتك (اختياري — تساعدنا على توجيهك للقنوات الصحيحة لاحقاً)</label>
            <select className="select" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="">أفضّل عدم التحديد</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.nameAr}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>ملخص حر (اختياري — بحد أقصى 500 حرف، بلا بيانات هوية)</label>
            <textarea
              className="textarea"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={500}
              placeholder="اكتب ما حدث بكلماتك إن أردت — يمكنك تركه فارغاً"
            />
            <span className="hint">هذا الملخص يُخزن مع القضية ويظهر لك عند المتابعة فقط حتى توافق على مشاركته.</span>
          </div>

          <Card style={{ background: "var(--paper)", marginBottom: 14 }}>
            <h3 className="card-title" style={{ fontSize: "0.95rem" }}>ماذا سنخزن بالضبط؟</h3>
            <ul className="list-plain" style={{ fontSize: "0.9rem" }}>
              <li>نوع الحادثة ووضعها (مستمر/متوقف، تهديد نشر، قاصر، خطر جسدي)</li>
              <li>الدولة إن اخترتها، والملخص الحر إن كتبته</li>
              <li>رقم قضية عشوائي لا يحمل أي معلومة عنك، ورمز متابعة مشفراً</li>
            </ul>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              لا نخزن: عنوان IP مرتبطاً بالقضية، ولا بيانات هوية، ولا ملفات. يمكنك حذف القضية
              نهائياً في أي وقت من صفحة المتابعة.
            </p>
          </Card>

          <label className="quiz-option" style={{ cursor: "pointer", borderColor: consent ? "var(--teal-600)" : undefined }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>أوافق على تخزين البلاغ بالحدود الموضحة أعلاه، وأفهم أن رمز المتابعة لا يمكن استرجاعه إذا فقده.</span>
          </label>

          {error && <Alert kind="danger">{error}</Alert>}

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <Button variant="outline" onClick={() => setStep(1)}>رجوع</Button>
            <Button block disabled={!consent || busy} onClick={submit}>
              {busy ? "جارٍ الإنشاء…" : "أنشئ البلاغ"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
