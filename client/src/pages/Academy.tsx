import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Lesson, VideoItem } from "../../../shared/types";
import { api } from "../lib/api";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Icon, Spinner } from "../components/ui";

const TRACKS: { id: "beginner" | "intermediate" | "advanced"; label: string; desc: string }[] = [
  { id: "beginner", label: "الأساسيات", desc: "لا تحتاج أي خلفية تقنية — ابدأ من هنا" },
  { id: "intermediate", label: "ما بعد الأساسيات", desc: "ضبط أعمق لحساباتك وأجهزتك" },
  { id: "advanced", label: "الاستعداد المتقدم", desc: "الاستعادة والإبلاغ عند وقوع الحادثة" },
];

export function AcademyPage() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<"all" | "beginner" | "intermediate" | "advanced">("all");

  async function load() {
    setError(null);
    try {
      const [l, v] = await Promise.all([api.lessons(), api.videos()]);
      setLessons(l.lessons);
      setVideos(v.videos);
    } catch {
      setError("تعذر الوصول لقائمة الدروس — تحقق من اتصالك بالإنترنت");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <div className="container page"><ErrorState message={error} onRetry={load} /></div>;
  if (!lessons) return <div className="container page"><Spinner label="تحميل الدروس…" /></div>;

  const visible = track === "all" ? lessons : lessons.filter((l) => l.track === track);

  return (
    <div className="container page">
      <div className="page-header">
        <h1 className="page-title">الأكاديمية</h1>
        <p className="page-subtitle">
          دروس قصيرة، كل درس يقرأ في دقائق ويختم باختبار سريع وقائمة خطوات للتطبيق. الأمثلة داخل
          الدروس محاكاة للتدريب فقط — لا روابط حية ولا ملفات.
        </p>
      </div>

      <div className="track-tabs" role="tablist" aria-label="مسارات التعلم">
        <button role="tab" aria-selected={track === "all"} className="chip" style={track === "all" ? { background: "var(--teal-600)", color: "#fff", borderColor: "var(--teal-600)" } : undefined} onClick={() => setTrack("all")}>
          الكل ({lessons.length})
        </button>
        {TRACKS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={track === t.id}
            className="chip"
            style={track === t.id ? { background: "var(--teal-600)", color: "#fff", borderColor: "var(--teal-600)" } : undefined}
            onClick={() => setTrack(t.id)}
          >
            {t.label} ({lessons.filter((l) => l.track === t.id).length})
          </button>
        ))}
      </div>

      {track !== "all" && <p className="muted" style={{ marginTop: 0 }}>{TRACKS.find((t) => t.id === track)?.desc}</p>}

      {visible.length === 0 ? (
        <EmptyState title="لا دروس في هذا المسار حالياً" hint="جرّب مساراً آخر" />
      ) : (
        <div className="grid grid-2">
          {visible.map((l) => (
            <Card key={l.id}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Badge tone="teal">{TRACKS.find((t) => t.id === l.track)?.label}</Badge>
                <span className="muted">قراءة {l.minutes} دقائق</span>
              </div>
              <h3 className="card-title">{l.title}</h3>
              <p className="card-text">{l.objective}</p>
              <Link to={`/academy/${l.id}`} className="btn btn-outline btn-sm" style={{ marginTop: 12 }}>
                اقرأ الدرس
              </Link>
            </Card>
          ))}
        </div>
      )}

      <h2 className="section-title">مصادر مرئية</h2>
      {videos.length === 0 ? (
        <EmptyState
          title="لا مواد مرئية منشورة بعد"
          hint="لا نعرض أي مادة إلا بعد التحقق من وجود مصدرها وروابطه — التحقق يتم من لوحة المشرفين"
        />
      ) : (
        <div className="grid grid-2">
          {videos.map((v) => (
            <Card key={v.id}>
              <h3 className="card-title">{v.title}</h3>
              <p className="card-text" style={{ fontSize: "0.88rem" }}>
                المصدر: {v.source} · المستوى:{" "}
                {v.difficulty === "beginner" ? "مبتدئ" : v.difficulty === "intermediate" ? "متوسط" : "متقدم"}
              </p>
              {v.note && <p className="muted" style={{ fontSize: "0.82rem" }}>{v.note}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <a className="btn btn-primary btn-sm" href={v.url} target="_blank" rel="noopener noreferrer">
                  فتح المصدر
                </a>
                {v.verifiedAt ? (
                  <span className="verified-tag">رابط متحقق منه بتاريخ {v.verifiedAt}</span>
                ) : (
                  <span className="unverified-tag">لم يتحقق منه بعد</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!lessonId) return;
    api
      .lesson(lessonId)
      .then((r) => setLesson(r.lesson))
      .catch(() => setError("تعذر تحميل هذا الدرس"));
  }, [lessonId]);

  if (error) return <div className="container page"><ErrorState message={error} /></div>;
  if (!lesson) return <div className="container page"><Spinner label="تحميل الدرس…" /></div>;

  const correctCount = lesson.quiz.filter((q) => answers[q.id] === q.correctIndex).length;
  const allAnswered = lesson.quiz.every((q) => answers[q.id] !== undefined);

  return (
    <div className="container page" style={{ maxWidth: 780 }}>
      <Link to="/academy" className="muted" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="arrow" size={14} /> كل الدروس
      </Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h1 className="page-title">{lesson.title}</h1>
        <div className="lesson-meta">
          <Badge tone="teal">{TRACKS.find((t) => t.id === lesson.track)?.label}</Badge>
          <span>قراءة {lesson.minutes} دقائق</span>
        </div>
        <p className="page-subtitle"><strong>ما ستتعلمه:</strong> {lesson.objective}</p>
      </div>

      <Card>
        {lesson.sections.map((s, i) => (
          <div className="lesson-section" key={i}>
            <h3>{s.heading}</h3>
            <p>{s.body}</p>
          </div>
        ))}

        {lesson.examples.length > 0 && (
          <>
            <h3>أمثلة تدريبية (محاكاة آمنة، وليست روابط حقيقية)</h3>
            {lesson.examples.map((ex, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <p style={{ fontWeight: 700, margin: "0 2px" }}>{ex.label}</p>
                <div className="example-pair">
                  <div className="example-card example-safe">
                    <div className="example-pair-label">طريقة سليمة</div>
                    {ex.safe}
                  </div>
                  <div className="example-card example-fake">
                    <div className="example-pair-label">نمط خادع (محاكاة)</div>
                    {ex.fake}
                  </div>
                </div>
                <p className="example-note">{ex.note}</p>
              </div>
            ))}
          </>
        )}
      </Card>

      <h2 className="section-title">اختبار سريع</h2>
      {lesson.quiz.map((q, qi) => (
        <div className="quiz-q" key={q.id}>
          <h4>{qi + 1}. {q.question}</h4>
          {q.options.map((opt, oi) => {
            const selected = answers[q.id] === oi;
            const isCorrect = checked && oi === q.correctIndex;
            const isWrongChoice = checked && selected && oi !== q.correctIndex;
            return (
              <label key={oi} className={`quiz-option ${isCorrect ? "correct" : ""} ${isWrongChoice ? "wrong" : ""}`} style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name={q.id}
                  checked={selected}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                  disabled={checked}
                />
                <span>{opt}</span>
              </label>
            );
          })}
          {checked && (
            <div className="quiz-explain">
              {answers[q.id] === q.correctIndex ? "إجابة صحيحة. " : "الإجابة الصحيحة موضحة أعلاه. "}
              {q.explanation}
            </div>
          )}
        </div>
      ))}

      {!checked ? (
        <Button disabled={!allAnswered} onClick={() => setChecked(true)} block>
          {allAnswered ? "اعرض نتيجتي" : `أجب عن كل الأسئلة (${Object.keys(answers).length}/${lesson.quiz.length})`}
        </Button>
      ) : (
        <Alert kind={correctCount === lesson.quiz.length ? "ok" : "info"}>
          {correctCount} من {lesson.quiz.length}{" "}
          {correctCount === lesson.quiz.length
            ? "— نتائج ممتازة، أنت جاهز للتطبيق."
            : "— راجع التفسيرات أعلاه، فهي أهم من الدرجة نفسها."}
          <div style={{ marginTop: 10 }}>
            <Button variant="outline" size="sm" onClick={() => { setChecked(false); setAnswers({}); }}>
              إعادة الاختبار
            </Button>
          </div>
        </Alert>
      )}

      <h2 className="section-title">قائمة التطبيق</h2>
      <Card>
        <ul className="checklist">
          {lesson.checklist.map((c, i) => (
            <li key={i}><span className="tick"><Icon name="check" size={15} /></span> {c}</li>
          ))}
        </ul>
      </Card>

      <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link to="/academy" className="btn btn-secondary">دروس أخرى</Link>
        <Link to="/assessment" className="btn btn-outline">قِس عاداتك الرقمية</Link>
      </div>
    </div>
  );
}
