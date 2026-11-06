import { useState } from "react";
import { Link } from "react-router-dom";
import type { BreachResult } from "../../../../shared/types";
import { api, sha1Upper } from "../../lib/api";
import { Alert, Badge, Button, Card, Icon } from "../../components/ui";

export function BreachCheckPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BreachResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.includes("@") || email.length < 5) {
      setError("اكتب بريداً إلكترونياً صحيحاً");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const hash = await sha1Upper(email.trim().toLowerCase());
      const r = await api.breach(hash);
      setResult(r.result);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إجراء الفحص");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <Link to="/tools" className="muted" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="arrow" size={14} /> كل الأدوات
      </Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h1 className="page-title">تسريبات البريد</h1>
        <p className="page-subtitle">
          نتحقق من قاعدة تسريبات معلنة تديرها خدمة Have I Been Pwned المتخصصة. القاعدة توثق
          التسريبات المعروفة فقط، ولا أحد يملك سجلاً كاملاً لكل تسريب حدث في العالم.
        </p>
      </div>

      <Card>
        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              autoComplete="off"
            />
            <Button onClick={submit} disabled={busy || !email}>فحص</Button>
          </div>
          <span className="hint">
            يتحول بريدك إلى بصمة SHA-1 داخل متصفحك، والبصمة وحدها هي التي تُرسل. البريد نفسه لا يصل
            إلينا، ولا يُخزن ولا يُسجل في أي مكان، والحقل يُمسح تلقائياً بعد الفحص.
          </span>
        </div>
        {error && <Alert kind="danger">{error}</Alert>}
        {busy && <Alert kind="info">جارٍ الفحص…</Alert>}
      </Card>

      {result && (
        <div style={{ marginTop: 16 }}>
          {result.status === "unavailable" && (
            <Alert kind="warn">
              {result.disclaimer}
              <br />
              ما يمكنك فعله الآن بدل انتظار الخدمة: غيّر كلمة مرور أي حساب تعيد استخدام كلمته في
              أكثر من مكان، وفعّل التحقق بخطوتين على بريدك.
            </Alert>
          )}
          {result.status === "not_found" && (
            <Alert kind="info">
              لم يظهر هذا البريد في التسريبات الموثقة المتاحة للفحص. هذا مطمئن جزئياً فقط: قد يكون
              البريد ضمن تسريبات لم تُعلن أو لم تُفهرس بعد، ولا يوجد فحص يستطيع الجزم بعكس ذلك. ما
              يبقى مفيداً دائماً: كلمة مرور مختلفة لكل حساب وتفعيل التحقق بخطوتين.
            </Alert>
          )}
          {result.status === "found" && (
            <>
              <Alert kind="danger">{result.disclaimer}</Alert>
              {result.breaches.map((b, i) => (
                <div className="breach-item" key={i}>
                  <strong>{b.name}</strong>
                  <span className="muted"> — تاريخ التسريب: {b.breachDate}{b.verified ? " · موثق من مصدره" : " · غير مؤكد"}</span>
                  {b.exposedDataKinds.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {b.exposedDataKinds.map((k, j) => (
                        <Badge key={j}>{k}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <Card style={{ marginTop: 12 }}>
                <h3 className="card-title">ما تفعله الآن</h3>
                <ul className="list-plain">
                  <li>غيّر كلمة مرور أي حساب كنت تعيد استخدام إحدى هذه الكلمات فيه — وابدأ بالبريد نفسه</li>
                  <li>فعّل التحقق بخطوتين على بريدك ثم على الحسابات المالية</li>
                  <li>توقّع رسائل تصيد تعرف اسمك وخدماتك — تحقق من أي طلب عبر تطبيق الجهة الرسمي مباشرة</li>
                  <li>درسا «كلمات المرور» و«كشف التصيد» في <Link to="/academy">الأكاديمية</Link> يغطيان ما تحتاجه</li>
                </ul>
              </Card>
            </>
          )}
          <Alert kind="info">{result.providerDisclosure}</Alert>
        </div>
      )}
    </div>
  );
}
