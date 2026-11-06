import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AssessmentResult } from "../../../shared/types";
import { assessmentQuestions, scoreAssessment, MAX_ASSESSMENT_SCORE } from "../../../shared/content/assessment";
import { Alert, Button, Card, Icon } from "../components/ui";

const STORAGE_KEY = "dm-assessment-v1";

const BAND_KIND: Record<AssessmentResult["band"], { kind: "danger" | "warn" | "info" | "ok"; title: string }> = {
  weak: { kind: "danger", title: "أولوياتك العاجلة" },
  fair: { kind: "warn", title: "قابل للتحسين" },
  good: { kind: "info", title: "وضعك جيد" },
  strong: { kind: "ok", title: "وضعك متين" },
};

export function AssessmentPage() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);
  const [saveConsent, setSaveConsent] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const result = useMemo(() => scoreAssessment(answers), [answers]);
  const answeredAll = assessmentQuestions.every((q) => answers[q.id] !== undefined);

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, result, at: new Date().toISOString() }));
      setSavedNote(true);
    } catch {
      setSavedNote(false);
    }
  }

  function loadSaved(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { answers: Record<string, number> };
      setAnswers(parsed.answers);
      setDone(true);
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    setAnswers({});
    setDone(false);
    setSaveConsent(false);
    setSavedNote(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* لا شيء */
    }
  }

  const hadSaved = useMemo(() => {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">فحص عاداتك الرقمية</h1>
        <p className="page-subtitle">
          عشرة أسئلة عن عاداتك اليومية لا عن معلوماتك. النتيجة تقيس ما تفعله بالفعل وتقترح الترتيب
          العملي للتحسين. هذا تقييم ذاتي بشفافية كاملة، وليس تدقيقاً ولا ضماناً لأي حماية.
        </p>
      </div>

      <Card>
        <h3 className="card-title">كيف تحسب النتيجة؟</h3>
        <p className="card-text">
          كل سؤال أربعة خيارات، من الأسوأ (صفر) إلى الأفضل (10 نقاط)، والمجموع الكلي {MAX_ASSESSMENT_SCORE}
          . النتيجة تُقسم على سبعة محاور: كلمات المرور، حماية الحسابات، الاستعداد للاستعادة، أمن
          الأجهزة، النسخ الاحتياطي، الخصوصية، والوعي بالاحتيال. النطاقات: 85% فأكثر متين، 65–84%
          جيد، 40–64% قابل للتحسين، وأقل من 40% يحتاج بداية سريعة.
        </p>
      </Card>

      {!done && hadSaved && (
        <Alert kind="info">
          توجد نتيجة سابقة محفوظة في هذا المتصفح.{" "}
          <Button variant="outline" size="sm" onClick={() => loadSaved()}>استرجاعها</Button>
        </Alert>
      )}

      {!done ? (
        <>
          {assessmentQuestions.map((q, qi) => (
            <Card key={q.id} style={{ marginBottom: 12 }}>
              <h3 className="card-title" style={{ fontSize: "0.98rem" }}>{qi + 1}. {q.text}</h3>
              <span className="muted">المحور: {q.dimension}</span>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {q.options.map((opt, oi) => (
                  <label key={oi} className="quiz-option" style={{ cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === oi}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </Card>
          ))}
          <Button block disabled={!answeredAll} onClick={() => setDone(true)}>
            {answeredAll ? "اعرض نتيجتي" : `أجب عن كل الأسئلة (${Object.keys(answers).length}/${assessmentQuestions.length})`}
          </Button>
        </>
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--navy-900)" }}>
                {result.percent}%
              </div>
              <div>
                <Alert kind={BAND_KIND[result.band].kind}>{BAND_KIND[result.band].title} — {result.bandLabel}</Alert>
                <span className="muted">{result.totalScore} من {result.maxScore} نقطة</span>
              </div>
            </div>

            {result.strengths.length > 0 && (
              <>
                <h3 className="card-title" style={{ marginTop: 18 }}>ما تفعله جيداً</h3>
                <ul className="trust-list">
                  {result.strengths.map((s, i) => (
                    <li key={i}><span className="tick"><Icon name="check" size={14} /></span>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {result.improvements.length > 0 && (
              <>
                <h3 className="card-title" style={{ marginTop: 18 }}>بماذا تبدأ (الأضعف أولاً)</h3>
                <ol style={{ margin: 0, paddingRight: 20, color: "var(--ink-2)", lineHeight: 1.9 }}>
                  {result.improvements.map((imp, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>
                      <strong>{imp.dimension}:</strong> {imp.advice}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>

          <Card style={{ marginTop: 16 }}>
            <h3 className="card-title">خطة أسبوع واقعية</h3>
            <ol style={{ margin: 0, paddingRight: 20, color: "var(--ink-2)", lineHeight: 1.9 }}>
              {result.sevenDayPlan.map((p, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{p}</li>
              ))}
            </ol>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/academy" className="btn btn-secondary btn-sm">الأكاديمية</Link>
              <Link to="/tools/password" className="btn btn-outline btn-sm">أداة كلمات المرور</Link>
            </div>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <h3 className="card-title">حفظ النتيجة (اختياري)</h3>
            <label style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
              <input type="checkbox" checked={saveConsent} onChange={(e) => setSaveConsent(e.target.checked)} style={{ marginTop: 5 }} />
              <span className="card-text">
                أوافق على حفظ النتيجة في هذا المتصفح فقط لمتابعة تقدمي لاحقاً. لا شيء يُرسل عبر
                الإنترنت، والحذف متاح لك في أي وقت.
              </span>
            </label>
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button size="sm" disabled={!saveConsent} onClick={save}>احفظ في هذا المتصفح</Button>
              <Button variant="danger" size="sm" onClick={reset}>حذف والبدء من جديد</Button>
            </div>
            {savedNote && <Alert kind="ok">حُفظت النتيجة في متصفحك فقط.</Alert>}
          </Card>
        </>
      )}
    </div>
  );
}
