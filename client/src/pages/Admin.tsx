import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Spinner } from "../components/ui";

interface Overview {
  lessons: { id: string; title: string; track: string; status: string }[];
  coreVideos: { id: string; title: string; status: string }[];
  videos: { id: number; title: string; url: string; status: string; verified_at: string | null }[];
  resources: { id: string; title: string; url: string; status: string; verification: string }[];
  customResources: { id: number; title: string; url: string; status: string; verified_at: string | null }[];
  playbooks: { id: string; title: string; category: string }[];
  audit: { id: number; admin_username: string; action: string; entity_type: string; entity_id: string; created_at: string }[];
}

function getCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  const raw = m?.[1];
  return raw ? decodeURIComponent(raw) : undefined;
}

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCookie("dm_csrf") ?? "",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? `خطأ ${res.status}`);
  return data;
}

export function AdminPage() {
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // نماذج الإضافة
  const [resTitle, setResTitle] = useState("");
  const [resUrl, setResUrl] = useState("");
  const [resKind, setResKind] = useState("cert");
  const [resDesc, setResDesc] = useState("");
  const [vidTitle, setVidTitle] = useState("");
  const [vidUrl, setVidUrl] = useState("");
  const [vidSource, setVidSource] = useState("");

  const loadOverview = useCallback(async () => {
    try {
      setOverview((await adminFetch("/api/admin/overview")) as unknown as Overview);
    } catch {
      setOverview(null);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/me")
      .then(async (r) => (r.ok ? setMe(await r.json()) : setMe(null)))
      .catch(() => setMe(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (me) void loadOverview();
  }, [me, loadOverview]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "فشل الدخول");
      setMe({ username, role: "admin" });
      setPassword("");
      void loadOverview();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "فشل الدخول");
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setMe(null);
    setOverview(null);
  }

  async function action(fn: () => Promise<Record<string, unknown>>, okMsg: string) {
    setBusyAction(true);
    setNotice(null);
    try {
      const r = await fn();
      setNotice(`${okMsg}${r.message ? ` — ${r.message as string}` : ""}`);
      await loadOverview();
    } catch (e) {
      setNotice(`تعذر: ${e instanceof Error ? e.message : "خطأ"}`);
    } finally {
      setBusyAction(false);
    }
  }

  if (checking) return <div className="container page"><Spinner label="جارٍ التحقق…" /></div>;

  if (!me) {
    return (
      <div className="container page" style={{ maxWidth: 460 }}>
        <div className="page-header">
          <h1 className="page-title">دخول المشرفين</h1>
          <p className="page-subtitle">هذه اللوحة لمشرفي المحتوى فقط. كل إجراء هنا يُسجل في سجل التدقيق باسمك ووقته.</p>
        </div>
        <Card>
          <form onSubmit={login}>
            <div className="field">
              <label htmlFor="auser">اسم المشرف</label>
              <input id="auser" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="apass">كلمة المرور</label>
              <input id="apass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {loginError && <Alert kind="danger">{loginError}</Alert>}
            <Button type="submit" block disabled={!username || !password}>دخول</Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">إدارة المحتوى</h1>
          <p className="page-subtitle">مساحة إدارة الدروس والموارد وحالات النشر والتحقق.</p>
        </div>
        <Button variant="outline" onClick={logout}>خروج</Button>
      </div>

      {notice && <Alert kind="info">{notice}</Alert>}
      {busyAction && <Alert kind="info">جارٍ التنفيذ…</Alert>}

      {!overview ? (
        <Spinner label="جارٍ تحميل البيانات…" />
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <h3 className="card-title">الدروس ({overview.lessons.length})</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead><tr><th>الدرس</th><th>المسار</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {overview.lessons.map((l) => (
                    <tr key={l.id}>
                      <td>{l.title}</td>
                      <td>{l.track === "beginner" ? "مبتدئ" : l.track === "intermediate" ? "انتقالي" : "متقدم"}</td>
                      <td><Badge tone={l.status === "published" ? "low" : "high"}>{l.status === "published" ? "منشور" : "مخفي"}</Badge></td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAction}
                          onClick={() =>
                            action(
                              () => adminFetch("/api/admin/content-status", {
                                method: "POST",
                                body: JSON.stringify({ entityType: "lesson", entityId: l.id, status: l.status === "published" ? "hidden" : "published" }),
                              }),
                              "تم تحديث الحالة"
                            )
                          }
                        >
                          {l.status === "published" ? "إخفاء" : "نشر"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h3 className="card-title">القنوات الرسمية ({overview.resources.length}) — فحص الروابط</h3>
            <p className="muted">زر «فحص» يجرب الوصول للرابط عبر وسيط آمن يمنع الشبكات الداخلية، ويثبت تاريخ الفحص عند نجاح الوصول فقط.</p>
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead><tr><th>المورد</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {overview.resources.map((r) => (
                    <tr key={r.id}>
                      <td><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></td>
                      <td>{r.verification === "seed-verified" ? <span className="verified-tag">رابط مفحوص</span> : <span className="unverified-tag">لم يُفحص بعد</span>}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <Button
                          size="sm"
                          disabled={busyAction}
                          onClick={() => action(() => adminFetch("/api/admin/resources/verify", { method: "POST", body: JSON.stringify({ id: r.id }) }), "نتيجة فحص الرابط")}
                        >
                          فحص
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAction}
                          onClick={() =>
                            action(
                              () => adminFetch("/api/admin/content-status", {
                                method: "POST",
                                body: JSON.stringify({ entityType: "resource", entityId: r.id, status: r.status === "published" ? "hidden" : "published" }),
                              }),
                              "تم تحديث الحالة"
                            )
                          }
                        >
                          {r.status === "published" ? "إخفاء" : "نشر"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h3 className="card-title">إضافة قناة رسمية</h3>
            <div className="grid grid-2">
              <div className="field">
                <label>العنوان</label>
                <input className="input" value={resTitle} onChange={(e) => setResTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>الرابط</label>
                <input className="input" dir="ltr" value={resUrl} onChange={(e) => setResUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="field">
                <label>الفئة</label>
                <select className="select" value={resKind} onChange={(e) => setResKind(e.target.value)}>
                  <option value="cert">فريق استجابة وطني</option>
                  <option value="cybercrime">جرائم إلكترونية</option>
                  <option value="consumer">حماية المستهلك</option>
                  <option value="account_recovery">استعادة حسابات</option>
                  <option value="abuse_report">إبلاغ عن إساءة</option>
                  <option value="education">تعليم</option>
                </select>
              </div>
              <div className="field">
                <label>الوصف</label>
                <input className="input" value={resDesc} onChange={(e) => setResDesc(e.target.value)} />
              </div>
            </div>
            <Button
              disabled={busyAction || !resTitle || !resUrl || !resDesc}
              onClick={() =>
                action(
                  () => adminFetch("/api/admin/resources", {
                    method: "POST",
                    body: JSON.stringify({ title: resTitle, url: resUrl, kind: resKind, description: resDesc, publish: true }),
                  }),
                  "أُضيفت القناة — اضغط «فحص» لتثبيت تاريخ الفحص"
                ).then(() => { setResTitle(""); setResUrl(""); setResDesc(""); })
              }
            >
              إضافة ونشر
            </Button>
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h3 className="card-title">إضافة مادة مرئية — راجع رابطها بنفسك قبل النشر</h3>
            <div className="grid grid-3">
              <div className="field">
                <label>العنوان</label>
                <input className="input" value={vidTitle} onChange={(e) => setVidTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>الرابط</label>
                <input className="input" dir="ltr" value={vidUrl} onChange={(e) => setVidUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="field">
                <label>المصدر</label>
                <input className="input" value={vidSource} onChange={(e) => setVidSource(e.target.value)} placeholder="مثال: قناة هيئة الأمن السيبراني" />
              </div>
            </div>
            <Button
              disabled={busyAction || !vidTitle || !vidUrl || !vidSource}
              onClick={() =>
                action(
                  () => adminFetch("/api/admin/videos", {
                    method: "POST",
                    body: JSON.stringify({ title: vidTitle, url: vidUrl, source: vidSource, publish: true }),
                  }),
                  "أُضيفت المادة"
                ).then(() => { setVidTitle(""); setVidUrl(""); setVidSource(""); })
              }
            >
              إضافة ونشر
            </Button>
          </Card>

          <Card>
            <h3 className="card-title">سجل الإجراءات (آخر 50)</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>الكيان</th></tr></thead>
                <tbody>
                  {overview.audit.map((a) => (
                    <tr key={a.id}>
                      <td dir="ltr">{a.created_at}</td>
                      <td>{a.admin_username}</td>
                      <td>{a.action}</td>
                      <td>{a.entity_type}:{a.entity_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
