import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LinkFinding } from "../../../../shared/types";
import { analyzeInput } from "../../../../shared/linkHeuristics";
import { api } from "../../lib/api";
import { Alert, Badge, Button, Card, Icon } from "../../components/ui";

type ScanReport = Awaited<ReturnType<typeof api.scan>>["report"];

const CHECK_STATUS: Record<string, { label: string; tone: "critical" | "high" | "medium" | "low" | "teal"; icon: string }> = {
  hit: { label: "علامة خطورة", tone: "critical", icon: "⚠" },
  warn: { label: "يستدعي حذراً", tone: "high", icon: "!" },
  clean: { label: "سليم", tone: "low", icon: "✓" },
  info: { label: "مُعد", tone: "teal", icon: "i" },
  error: { label: "تعذر", tone: "high", icon: "×" },
  disabled: { label: "معطل", tone: "medium", icon: "—" },
};

const VERDICT_STYLE: Record<string, { cls: string; icon: string }> = {
  danger: { cls: "alert-danger", icon: "🚫" },
  suspicious: { cls: "alert-danger", icon: "⚠️" },
  caution: { cls: "alert-warn", icon: "❕" },
  likely_ok: { cls: "alert-ok", icon: "✅" },
  unknown: { cls: "alert-info", icon: "❔" },
};

export function LinkAnalyzerPage() {
  const [mode, setMode] = useState<"scan" | "message">("scan");
  return (
    <div className="container page" style={{ maxWidth: 820 }}>
      <Link to="/tools" className="muted" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="arrow" size={14} /> كل الأدوات
      </Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h1 className="page-title">فحص الروابط والرسائل</h1>
        <p className="page-subtitle">
          فاحص شامل يجمع التحليل المحلي مع قواعد بيانات خارجية حقيقية: 146 ألف نطاق تصيد، سجل
          التسجيل الرسمي للنطاق (عمره)، وفحص حي آمن لصفحة الموقع — دون أن يفتح أنت الرابط أبداً.
        </p>
      </div>

      <div className="track-tabs">
        <button className="chip" style={mode === "scan" ? { background: "var(--teal-600)", color: "#fff", borderColor: "var(--teal-600)" } : undefined} onClick={() => setMode("scan")}>
          فحص رابط شامل
        </button>
        <button className="chip" style={mode === "message" ? { background: "var(--teal-600)", color: "#fff", borderColor: "var(--teal-600)" } : undefined} onClick={() => setMode("message")}>
          تحليل رسالة (محلي فوري)
        </button>
      </div>

      {mode === "scan" ? <FullScan /> : <MessageAnalyzer />}
    </div>
  );
}

function FullScan() {
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const clean = url.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    setReport(null);
    const phases = ["تحليل البنية…", "فحص قاعدة نطاقات التصيد (147 ألف)…", "التحقق من عمر النطاق…", "فحص الصفحة الحي عبر درع آمن…"];
    let pi = 0;
    setPhase(phases[0]!);
    const rotator = setInterval(() => {
      pi = Math.min(pi + 1, phases.length - 1);
      setPhase(phases[pi]!);
    }, 2500);
    try {
      const r = await api.scan(clean);
      setReport(r.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الفحص");
    } finally {
      clearInterval(rotator);
      setBusy(false);
      setPhase("");
    }
  }

  return (
    <>
      <Card>
        <div className="field">
          <label htmlFor="scanurl">الرابط المراد فحصه</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="scanurl"
              className="input"
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com أو example.com"
              autoComplete="off"
            />
            <Button onClick={run} disabled={busy || !url}>افحص شاملاً</Button>
          </div>
          <span className="hint">
            لا نفتح الرابط في متصفحك ولا ننزل ملفات — نسحب الصفحة الرئيسية فقط عبر وسيط آمن
            يمنع الشبكات الداخلية، ونقارن مع قواعد بيانات خارجية.
          </span>
        </div>
        {busy && <Alert kind="info">{phase} قد يستغرق حتى 30 ثانية…</Alert>}
        {error && <Alert kind="danger">{error}</Alert>}
      </Card>

      {report && <ScanReportView report={report} />}
    </>
  );
}

function ScanReportView({ report }: { report: ScanReport }) {
  const v = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.unknown!;
  return (
    <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
      <Card className={`risk-${report.verdict === "danger" ? "high" : report.verdict === "suspicious" ? "high" : report.verdict === "caution" ? "medium" : "low"}`}>
        <div className={`alert ${v.cls}`} style={{ margin: 0 }}>
          <strong style={{ fontSize: "1.05rem" }}>{v.icon} {report.verdictLabel}</strong>
          <div dir="ltr" style={{ marginTop: 4, fontSize: "0.85rem" }}>
            {report.host} · درجة الخطر: {report.score}/100
          </div>
        </div>
        <div className="meter" style={{ marginTop: 10 }} role="meter" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100} aria-label="درجة الخطر">
          <div className="meter-fill" style={{ width: `${Math.max(4, report.score)}%`, background: report.score >= 60 ? "var(--danger-700)" : report.score >= 35 ? "var(--warn-700)" : "var(--teal-600)" }} />
        </div>
        {report.domainAgeDays !== undefined && (
          <p className="muted" style={{ margin: "10px 0 0" }}>
            عمر النطاق: {report.domainAgeDays} يوم (سُجل {report.domainRegisteredAt})
          </p>
        )}
      </Card>

      <Card>
        <h3 className="card-title">نتائج الفحوص ({report.checks.length})</h3>
        {report.checks.map((c) => {
          const s = CHECK_STATUS[c.status] ?? CHECK_STATUS.info!;
          return (
            <div key={c.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 2px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone={s.tone}>{s.icon} {s.label}</Badge>
                <strong style={{ fontSize: "0.92rem" }}>{c.name}</strong>
                <span className="muted" style={{ fontSize: "0.78rem" }}>— {c.source}</span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "0.88rem", color: "var(--ink-2)" }}>{c.detail}</p>
            </div>
          );
        })}
      </Card>

      {report.contentFindings.length > 0 && (
        <Card>
          <h3 className="card-title">اكتشافات محتوى الصفحة</h3>
          {report.contentFindings.map((f, i) => (
            <div key={i} className={`alert ${f.severity === "high" ? "alert-danger" : f.severity === "medium" ? "alert-warn" : "alert-info"}`}>
              <strong>{f.title}:</strong> {f.detail}
            </div>
          ))}
        </Card>
      )}

      {report.localFindings.length > 0 && (
        <Card>
          <h3 className="card-title">علامات التحليل البنيوي ({report.localFindings.length})</h3>
          {report.localFindings.map((f: LinkFinding, i: number) => (
            <div key={i} className={`alert ${f.severity === "high" ? "alert-danger" : f.severity === "medium" ? "alert-warn" : "alert-info"}`}>
              <strong>{f.title}:</strong> {f.detail}
            </div>
          ))}
        </Card>
      )}

      <Alert kind="info">{report.disclaimer}</Alert>
      <p className="muted">وقت الفحص: {report.generatedAt.slice(0, 16).replace("T", " ")}</p>
    </div>
  );
}

function MessageAnalyzer() {
  const [input, setInput] = useState("");
  const live = useMemo(() => (input.trim() ? analyzeInput(input) : null), [input]);

  return (
    <>
      <Card>
        <div className="field">
          <label htmlFor="linkinput">الصق نص الرسالة أو الرابط (تحليل محلي فوري — لا يُرسل لأي جهة)</label>
          <textarea
            id="linkinput"
            className="textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="الصق الرسالة كاملة: «مبروك! فزت بجائزة، ادفع رسوم الاستلام عبر…»"
            dir="auto"
            maxLength={2000}
          />
        </div>
      </Card>

      {live && (() => {
        const a = live;
        const riskLabel = { high: "علامات خداع واضحة", medium: "علامات تستدعي الحذر", low: "لا علامات بنيوية بارزة", insufficient: "البيانات غير كافية" }[a.riskLevel];
        return (
          <Card className={`risk-${a.riskLevel}`} style={{ marginTop: 16 }}>
            <h3 className="card-title">
              {a.riskLevel === "high" ? "علامات خداع واضحة" : a.riskLevel === "medium" ? "علامات تستدعي الحذر" : a.riskLevel === "low" ? "لا علامات بنيوية بارزة" : "البيانات غير كافية"}
            </h3>
            {a.host && <p className="muted" dir="ltr" style={{ margin: 0 }}>Host: {a.host} · Registered domain: {a.registrableDomain}</p>}
            <p style={{ margin: "10px 0" }}><strong>خلاصة الثقة:</strong> {a.confidence}</p>
            {a.findings.length === 0 ? (
              <p className="muted">
                لم نجد علامات في بنية الرابط أو صياغة النص. لا تعامل مع هذا كدليل أمان — للفحص
                العميق استخدم تبويب «فحص رابط شامل» أعلاه.
              </p>
            ) : (
              a.findings.map((f, i) => (
                <div key={i} className={`alert ${f.severity === "high" ? "alert-danger" : f.severity === "medium" ? "alert-warn" : "alert-info"}`}>
                  <strong>{f.title}:</strong> {f.detail}
                </div>
              ))
            )}
            <h3 className="card-title" style={{ marginTop: 16 }}>الخطوات الآمنة</h3>
            <ul className="list-plain">
              {a.nextSteps.map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
            <p className="muted" style={{ marginTop: 12 }}>{a.disclaimer}</p>
          </Card>
        );
      })()}
    </>
  );
}
