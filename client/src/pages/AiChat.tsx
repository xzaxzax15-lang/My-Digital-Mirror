import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Alert, Button, Card, Icon } from "../components/ui";

const QUICK_QUESTIONS = [
  "كيف أعرف أن رسالة من البنك مزيفة؟",
  "ما هي الهندسة الاجتماعية وأمثلتها الشائعة؟",
  "شخص يهددني بنشر صور — ما الذي يجب ألا أفعله إطلاقاً؟",
  "كيف أحمي أطفالي من الابتزاز الرقمي؟",
  "ما هو التزييف العميق وكيف أشك في الفيديوهات؟",
  "لماذا لا أستخدم نفس كلمة المرور في كل مكان؟",
];

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Msg = {
  role: "assistant",
  content:
    "أهلاً بك — أنا مستشار مرآتي الرقمية للتوعية الأمنية.\nاسألني عن أي شيء يخص: التصيد، الهندسة الاجتماعية، الابتزاز الإلكتروني، حماية حساباتك أو خصوصيتك أو أطفالك.\n\nسؤال واحد قصير يكفي للبدء، وإن كنت في حادثة جارية الآن فصفحة «الإبلاغ الآمن» و«مساعد الحوادث» أدق لك مني.",
};

const ERROR_HINT =
  "المزود المجاني مزدحم أحياناً — أعد الإرسال بعد لحظات، أو استخدم مساعد الحوادث الذي يعمل دائماً بلا إنترنت خارجي.";

export function AiChatPage() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    // تقليم التاريخ: الردود الطويلة تُقصم — يمنع رفض الطلبات في الجلسات الممتدة
    const history = messages
      .filter((m) => m !== WELCOME)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
    setMessages([...messages, { role: "user", content }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setElapsed(0);
    setThinking(false);
    setError(null);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const r = await api.aiChatStream(
        [...history, { role: "user" as const, content }],
        (delta) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            if (last.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + delta };
            return copy;
          });
        },
        () => setThinking(true)
      );
      if (r.model) setSessionModel(r.model);
    } catch (e) {
      const msg = e instanceof Error ? e.message : ERROR_HINT;
      setError(
        msg.includes("طلبات كثيرة")
          ? "محادثات متقاربة أكثر من اللازم — انتظر دقيقتين ثم تابع، سؤالك محفوظ في الصفحة."
          : msg || ERROR_HINT
      );
    } finally {
      clearInterval(timer);
      setBusy(false);
      setThinking(false);
      // أزل الفقاعة الفارغة إن فشل الرد قبل أي حرف
      setMessages((prev) => {
        const last = prev[prev.length - 1]!;
        return last.role === "assistant" && last.content === "" ? prev.slice(0, -1) : prev;
      });
    }
  }

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">المستشار الذكي</h1>
        <p className="page-subtitle">
          حوار مفتوح مع مساعد ذكاء اصطناعي متخصص بالتوعية الأمنية: اسأله عن التصيد والهندسة
          الاجتماعية والابتزاز وحماية حساباتك — وسيرشدك بالعربية خطوة بخطوة.
        </p>
      </div>

      <Alert kind="info">
        <strong>اقرأ هذا قبل أن تبدأ:</strong> هذه محادثة توعوية تعمل عبر مزود مجاني خارجي
        (Pollinations) — سؤالك يُرسل إليه ولا يُخزن عندنا إطلاقاً، لكن لا تكتب في المحادثة كلمات
        مرور أو رموز تحقق أو بيانات هوية أو تفاصيل حساسة. النموذج قد يخطئ: هو للتوعية والفهم،
        أما حادثة جارية تحتاج خطوات موثقة فاستخدم{" "}
        <Link to="/assistant">مساعد الحوادث</Link> الحتمي، وللبلاغ الرسمي{" "}
        <Link to="/report">الإبلاغ الآمن</Link>. في خطر جسدي: اتصل بالطوارئ مباشرة.
      </Alert>

      <div className="chat-wrap">
        <div className="chat-toolbar">
          <span>
            <Icon name="lock" size={13} /> المحادثة لا تُخزن على خوادمنا
            {sessionModel && (
              <> · نموذج الجلسة: <strong dir="ltr">{sessionModel}</strong></>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMessages([WELCOME]);
              setSessionModel(null);
              setError(null);
            }}
          >
            <Icon name="trash" size={14} /> محادثة جديدة
          </Button>
        </div>

        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="سجل الحوار">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "msg msg-user" : "msg msg-assistant"}>
              <div className="msg-bubble">{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="msg msg-assistant">
              <div className="msg-bubble" aria-label="المستشار يعمل">
                <span className="spinner" style={{ width: 13, height: 13, display: "inline-block", marginInlineEnd: 8 }} />
                {thinking
                  ? "يحلل المستشار سؤالك ويجهز الإجابة…"
                  : "يتصل بالمستشار…"}
                {" "}({elapsed} ثانية)
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
            {QUICK_QUESTIONS.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => send(q)} disabled={busy}>
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
          <label htmlFor="ai-input" className="visually-hidden">اكتب سؤالك الأمني</label>
          <input
            id="ai-input"
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اسأل عن أي شيء في الأمن الرقمي…"
            maxLength={2000}
            disabled={busy}
            autoComplete="off"
          />
          <Button type="submit" disabled={!input.trim() || busy}>إرسال</Button>
        </form>
        <div className="chat-footnote">
          ردود المستشار إرشادية تعليمية وقد تحتمل الخطأ — القرار النهائي في مواقف الخطر يكون مع
          الجهات الرسمية المختصة في بلدك.
        </div>
      </div>
    </div>
  );
}
