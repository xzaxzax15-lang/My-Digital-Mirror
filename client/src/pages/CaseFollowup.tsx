import { useState } from "react";
import type { CaseView, EvidenceKind, EvidenceSubmission } from "../../../shared/types";
import { api } from "../lib/api";
import { Alert, Button, Card, Icon, QuickExit, UrgencyBadge } from "../components/ui";

const KIND_LABELS: Record<EvidenceKind, string> = {
  message: "رسالة أو محادثة",
  account: "حساب أو ملف تعريف",
  url: "رابط",
  payment: "عملية مالية",
  other: "أخرى",
};

const EVENT_LABELS: Record<string, string> = {
  created: "إنشاء القضية",
  triage: "تصنيف أولي",
  evidence_added: "إضافة دليل",
  viewed: "ولوج للقضية",
};

export function CaseFollowupPage() {
  const [caseNumber, setCaseNumber] = useState("");
  const [code, setCode] = useState("");
  const [view, setView] = useState<CaseView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // نموذج إضافة دليل
  const [eKind, setEKind] = useState<EvidenceKind>("message");
  const [ePlatform, setEPlatform] = useState("");
  const [eOccurredAt, setEOccurredAt] = useState("");
  const [eDescription, setEDescription] = useState("");
  const [eSha, setESha] = useState("");
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState<string | null>(null);

  // حذف القضية
  const [confirmText, setConfirmText] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  async function access() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.accessCase(caseNumber.trim().toUpperCase(), code.trim());
      setView(r.case);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الوصول للقضية");
    } finally {
      setBusy(false);
    }
  }

  async function addEvidence() {
    if (eDescription.trim().length < 3) {
      setEError("اكتب وصفاً مختصراً للدليل (3 أحرف على الأقل)");
      return;
    }
    setEBusy(true);
    setEError(null);
    try {
      const entry: EvidenceSubmission = {
        kind: eKind,
        platform: ePlatform.trim() || undefined,
        occurredAt: eOccurredAt.trim() || undefined,
        description: eDescription.trim(),
        sha256: eSha.trim() || undefined,
      };
      await api.addEvidence(view!.caseNumber, code.trim(), entry);
      setNotice("أُضيف الدليل وسُجل في سجل الحيازة");
      setEPlatform("");
      setEOccurredAt("");
      setEDescription("");
      setESha("");
      const r = await api.accessCase(view!.caseNumber, code.trim());
      setView(r.case);
    } catch (e) {
      setEError(e instanceof Error ? e.message : "تعذر إضافة الدليل");
    } finally {
      setEBusy(false);
    }
  }

  async function deleteCase() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.deleteCase(view!.caseNumber, code.trim());
      setView(null);
      setNotice(r.message);
      setConfirmText("");
      setShowDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <div className="container page" style={{ maxWidth: 560 }}>
        <div className="page-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h1 className="page-title">متابعة قضية</h1>
              <p className="page-subtitle">أدخل رقم القضية ورمز المتابعة اللذين حفظتهما عند الإنشاء.</p>
            </div>
            <QuickExit />
          </div>
        </div>
        <Card>
          {notice && <Alert kind="ok">{notice}</Alert>}
          <div className="field">
            <label htmlFor="cnum">رقم القضية</label>
            <input id="cnum" className="input" dir="ltr" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="MR-XXXXXXXX" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="ccode">رمز المتابعة</label>
            <input id="ccode" className="input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </div>
          {error && <Alert kind="danger">{error}</Alert>}
          <Button block disabled={!caseNumber || !code || busy} onClick={access}>
            {busy ? "جارٍ التحقق…" : "فتح القضية"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className="page-title">القضية {view.caseNumber}</h1>
            <p className="page-subtitle">
              الحالة: <strong>{view.statusLabel}</strong> · فُتحت: {view.createdAt.slice(0, 10)}
            </p>
          </div>
          <QuickExit />
        </div>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 className="card-title" style={{ margin: 0, flex: 1 }}>{view.incidentTitle}</h3>
          <UrgencyBadge urgency={view.severity} />
        </div>
        {view.summary && (
          <p className="card-text" style={{ marginTop: 8 }}>
            <strong>ملخصك:</strong> {view.summary}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {view.ongoing && <span className="badge badge-high">مستمرة الآن</span>}
          {view.publicationThreat && <span className="badge badge-critical">تهديد بنشر</span>}
          {view.minorInvolved && <span className="badge badge-critical">ضحية قاصر</span>}
          {view.physicalRisk && <span className="badge badge-critical">خطر جسدي</span>}
          {view.countryCode && <span className="badge">الدولة: {view.countryCode}</span>}
        </div>
        {view.severity === "critical" && (
          <Alert kind="danger">
            قضيتك مصنفة طارئة. إن كان هناك خطر جسدي أو الضحية قاصرة، فالجهة الرسمية المختصة في
            بلدك هي أولوية الآن — هذا النظام لا يصل إلى الطوارئ.
          </Alert>
        )}
      </Card>

      <h2 className="section-title">سجل القضية</h2>
      <Card>
        <ul className="list-plain">
          {view.events.map((ev, i) => (
            <li key={i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <strong>{EVENT_LABELS[ev.type] ?? ev.type}</strong>
              {ev.note && <span className="muted"> — {ev.note}</span>}
              <span className="muted" dir="ltr" style={{ display: "block", fontSize: "0.8rem" }}>{ev.at}</span>
            </li>
          ))}
        </ul>
      </Card>

      <h2 className="section-title">الأدلة المسجلة ({view.evidence.length})</h2>
      {view.evidence.length === 0 ? (
        <Alert kind="info">
          لم تسجل أدلة بعد. سجّل أدلتك كبيانات وصفية — ولا ترفع أبداً صوراً أو مقاطع خاصة إلى
          المنصة، واحتفظ بالملفات الأصلية على جهازك.
        </Alert>
      ) : (
        view.evidence.map((e) => (
          <Card key={e.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge badge-teal">{KIND_LABELS[e.kind] ?? e.kind}</span>
              {e.platform && <span className="badge">{e.platform}</span>}
              {e.occurredAt && <span className="muted">وقت الحدث: {e.occurredAt}{e.timezone ? ` (${e.timezone})` : ""}</span>}
            </div>
            <p className="card-text" style={{ marginTop: 8 }}>{e.description}</p>
            {e.sha256 && (
              <p className="muted" dir="ltr" style={{ margin: "6px 0 0", wordBreak: "break-all" }}>
                SHA-256: {e.sha256}
              </p>
            )}
            <p className="muted" style={{ margin: "6px 0 0" }}>سُجل بتاريخ {e.createdAt.slice(0, 10)}</p>
          </Card>
        ))
      )}

      <Card style={{ marginTop: 12 }}>
        <h3 className="card-title">إضافة دليل (بيانات وصفية فقط)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          لا ترفع الملف نفسه — سجّل وصفه ومصدره ووقته. إن أردت توثيق بصمة ملف لديك، احسب SHA-256
          محلياً (على ويندوز: <code dir="ltr">certutil -hashfile الملف SHA256</code>) والصق البصمة
          هنا. الملف يبقى عندك.
        </p>
        <div className="grid grid-2">
          <div className="field">
            <label>نوع الدليل</label>
            <select className="select" value={eKind} onChange={(e) => setEKind(e.target.value as EvidenceKind)}>
              {Object.entries(KIND_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>المنصة أو المصدر (اختياري)</label>
            <input className="input" value={ePlatform} onChange={(e) => setEPlatform(e.target.value)} placeholder="مثال: واتساب، إنستغرام" />
          </div>
          <div className="field">
            <label>وقت الحدث التقريبي (اختياري)</label>
            <input className="input" value={eOccurredAt} onChange={(e) => setEOccurredAt(e.target.value)} placeholder="مثال: 2026-11-01 مساءً" />
          </div>
          <div className="field">
            <label>بصمة SHA-256 (اختيارية)</label>
            <input className="input" dir="ltr" value={eSha} onChange={(e) => setESha(e.target.value)} placeholder="64 حرفاً سدسياً عشرياً" />
          </div>
        </div>
        <div className="field">
          <label>الوصف</label>
          <textarea className="textarea" value={eDescription} onChange={(e) => setEDescription(e.target.value)} maxLength={800} placeholder="مثال: رسالة تهديد من حساب باسم X عبر واتساب تطلب مبلغاً مقابل عدم نشر صور" />
        </div>
        {eError && <Alert kind="danger">{eError}</Alert>}
        {notice && <Alert kind="ok">{notice}</Alert>}
        <Button disabled={eBusy || eDescription.trim().length < 3} onClick={addEvidence}>
          {eBusy ? "جارٍ الحفظ…" : "أضف الدليل"}
        </Button>
      </Card>

      {view.custodyLog.length > 0 && (
        <>
          <h2 className="section-title">سجل حيازة الأدلة</h2>
          <Card>
            <table className="admin-table">
              <thead><tr><th>الإجراء</th><th>الجهة</th><th>الوقت</th></tr></thead>
              <tbody>
                {view.custodyLog.map((l, i) => (
                  <tr key={i}>
                    <td>{l.action === "create" ? "إنشاء" : "اطلاع"}</td>
                    <td>{l.actor === "victim" ? "الضحية" : l.actor}</td>
                    <td dir="ltr">{l.at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="outline" onClick={() => window.print()}>
          <Icon name="clipboard" size={15} /> طباعة / حفظ تقرير
        </Button>
        <Button variant="danger" size="sm" onClick={() => setShowDelete(!showDelete)}>حذف القضية نهائياً</Button>
      </div>

      {showDelete && (
        <Card style={{ marginTop: 12, borderColor: "var(--danger-line)" }}>
          <Alert kind="danger">
            سيُحذف كل شيء نهائياً: القضية والسجل والأدلة — بلا رجوع. اكتب رقم القضية للتأكيد.
          </Alert>
          <div className="field" style={{ marginTop: 10 }}>
            <input className="input" dir="ltr" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={view.caseNumber} />
          </div>
          <Button variant="danger" disabled={confirmText !== view.caseNumber || busy} onClick={deleteCase}>
            تأكيد الحذف النهائي
          </Button>
        </Card>
      )}
    </div>
  );
}
