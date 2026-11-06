import { useEffect, useRef, useState } from "react";
import type { AssistantState, ChatMessage, IncidentPlan } from "../../../shared/types";
import { api } from "../lib/api";
import { Alert, Button, Icon, UrgencyBadge } from "../components/ui";

const QUICK_STARTS = [
  "حسابي على إنستغرام مسحوب وما أقدر أدخل",
  "ضغطت رابط في رسالة بنك وكتبت بياناتي",
  "شخص يهددني بنشر صور",
  "طلبت من متجر ودفعت وما وصل شيء",
  "وصلني رمز تحقق ما طلبت شي",
  "جهازي صار بطيء وإعلانات تطلع وحدها",
];

function PlanView({ plan }: { plan: IncidentPlan }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="plan-box">
      <div className="plan-head">
        <h3>{plan.title}</h3>
        <UrgencyBadge urgency={plan.urgency} />
      </div>
      <div className="plan-reason">
        {plan.urgencyReason}. هذا تقييم مبدئي بناءً على ما ذكرته، ويُحدَّث كلما وضّحت تفاصيل أكثر.
      </div>

      {plan.phases.map((phase) => (
        <div className="plan-phase" key={phase.phase}>
          <div className={`plan-phase-title ${phase.phase === "now" ? "phase-now" : phase.phase === "next" ? "phase-next" : "phase-after"}`}>
            {phase.label}
          </div>
          {phase.steps.map((step, i) => {
            const key = `${phase.phase}-${i}`;
            const isDone = done.has(key);
            return (
              <div className={`step ${isDone ? "done" : ""}`} key={key}>
                <input
                  type="checkbox"
                  className="step-check"
                  checked={isDone}
                  onChange={() => toggle(key)}
                  aria-label={`تم إنجاز: ${step.what}`}
                />
                <div className="step-body">
                  <div className="step-what">{step.what}</div>
                  <div className="step-details">
                    <div><span className="lbl">السبب:</span> {step.why}</div>
                    <div><span className="lbl">كيف تتأكد:</span> {step.verify}</div>
                    {step.ifFailed && (
                      <div className="if-failed"><span className="lbl">إن لم ينجح:</span> {step.ifFailed}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {plan.doNot.length > 0 && (
        <div className="plan-phase plan-donot">
          <div className="plan-phase-title">تجنّب هذه التصرفات</div>
          <ul>
            {plan.doNot.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.links.length > 0 && (
        <div className="plan-links">
          <h4>روابط رسمية مفيدة</h4>
          <ul>
            {plan.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>{" "}
                <span className="src">— {l.publisher}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "اطلّعني على اللي صار بكلماتك — جملة أو سطرين تكفي، مثل: «حسابي مسحوب وما أقدر أدخل» أو «وصلتني رسالة مالية غريبة».\n" +
    "أي معلومة حساسة اكتبها بلا تفاصيل: لا كلمات مرور ولا رموز ولا أرقام بطاقات.",
};

export function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [state, setState] = useState<AssistantState>({ urgency: "low", askedClarifications: false, deliveredPlan: false });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || offline) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const { reply, state: newState } = await api.assistant(
        nextMessages.filter((m) => m !== WELCOME).map((m) => ({ role: m.role, content: m.content })),
        state
      );
      setMessages((prev) => [...prev, reply]);
      setState(newState);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("طلبات كثيرة")
          ? "رسائل متقاربة أكثر من اللازم — انتظر دقيقة ثم تابع، ما كتبته ظاهر عندك في الصفحة."
          : "تعذّر الوصول للمساعد الآن. تحقق من اتصالك بالإنترنت؛ محادثتك ما زالت في الصفحة ويمكنك المتابعة عند عودة الاتصال."
      );
    } finally {
      setBusy(false);
    }
  }

  function resetChat() {
    setMessages([WELCOME]);
    setState({ urgency: "low", askedClarifications: false, deliveredPlan: false });
    setError(null);
  }

  return (
    <div className="container page">
      <div className="page-header">
        <h1 className="page-title">مساعد الحوادث</h1>
        <p className="page-subtitle">
          صف ما حدث، وسنساعدك على ترتيب الخطوات خطوة خطوة. الإجابات هنا إرشادية لوضعك أنت، وليست
          تشخيصاً قاطعاً.
        </p>
      </div>

      {offline && (
        <Alert kind="warn">
          لا يوجد اتصال بالإنترنت الآن. احتفظ بهذه الصفحة مفتوحة إن كانت الخطة معروضة، وستعمل
          المحادثة مجدداً عند عودة الاتصال.
        </Alert>
      )}

      <div className="chat-wrap">
        <div className="chat-toolbar">
          <span>
            <Icon name="lock" size={13} /> المحادثة تبقى في هذه الصفحة فقط ولا تُحفظ عندنا
          </span>
          <Button variant="outline" size="sm" onClick={resetChat}>
            <Icon name="trash" size={14} /> حذف المحادثة
          </Button>
        </div>

        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="سجل المحادثة">
          {messages.map((m, i) => (
            <div key={i} style={{ display: "grid", gap: 6 }}>
              <div className={m.role === "user" ? "msg msg-user" : "msg msg-assistant"}>
                <div className="msg-bubble">{m.content}</div>
              </div>
              {m.plan && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ width: "100%", maxWidth: 640 }}>
                    <PlanView plan={m.plan} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="msg msg-assistant">
              <div className="msg-bubble" aria-label="المساعد يكتب">
                <span className="spinner" style={{ width: 14, height: 14, display: "inline-block", marginInlineEnd: 8 }} />
                يجهّز الرد…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "0 16px" }}>
            <Alert kind="danger">{error}</Alert>
          </div>
        )}

        {messages.length <= 1 && (
          <div className="quick-chips">
            {QUICK_STARTS.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => send(q)} disabled={busy || offline}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="chat-input" className="visually-hidden">اكتب وصف الحادثة</label>
          <input
            id="chat-input"
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب ما حدث…"
            maxLength={4000}
            disabled={busy}
            autoComplete="off"
          />
          <Button type="submit" disabled={!input.trim() || busy || offline}>إرسال</Button>
        </form>
        <div className="chat-footnote">
          تقييم الحالة مبني على كلامك أنت ولا يغني عن جهة رسمية. إن كان في خطر جسدي الآن، اتصل
          بالطوارئ قبل أي خطوة هنا.
        </div>
      </div>
    </div>
  );
}
