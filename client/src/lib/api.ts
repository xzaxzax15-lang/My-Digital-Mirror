// طبقة الاتصال بالخادم — كل الطلبات ضمن نفس النطاق
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `خطأ (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* استجابة غير JSON */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  assistant: (messages: { role: "user" | "assistant"; content: string }[], state: unknown) =>
    request<{ reply: import("../../../shared/types").ChatMessage; state: import("../../../shared/types").AssistantState }>("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ messages, state }),
    }),

  lessons: () => request<{ lessons: import("../../../shared/types").Lesson[] }>("/api/lessons"),
  lesson: (id: string) => request<{ lesson: import("../../../shared/types").Lesson }>(`/api/lessons/${id}`),
  videos: () => request<{ videos: import("../../../shared/types").VideoItem[] }>("/api/videos"),
  resources: () => request<{ resources: import("../../../shared/types").OfficialResource[] }>("/api/resources"),

  analyze: (input: string) =>
    request<{ analysis: import("../../../shared/types").LinkAnalysis }>("/api/tools/analyze", {
      method: "POST",
      body: JSON.stringify({ input }),
    }),

  scan: (url: string) =>
    request<{ report: {
      url: string; host: string; registrableDomain: string;
      verdict: string; verdictLabel: string; score: number;
      checks: { id: string; name: string; source: string; status: string; severity?: string; detail: string }[];
      redirectChain?: string[]; domainAgeDays?: number; domainRegisteredAt?: string;
      contentFindings: import("../../../shared/types").LinkFinding[];
      localFindings: import("../../../shared/types").LinkFinding[];
      generatedAt: string; disclaimer: string;
    } }>("/api/tools/scan", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  breach: (emailHash: string) =>
    request<{ result: import("../../../shared/types").BreachResult }>("/api/tools/breach", {
      method: "POST",
      body: JSON.stringify({ emailHash }),
    }),

  playbooks: () =>
    request<{ playbooks: { id: string; title: string; category: string; defaultUrgency: string }[] }>("/api/playbooks"),

  reportCase: (submission: import("../../../shared/types").ReportSubmission) =>
    request<{ caseNumber: string; followupCode: string }>("/api/report", {
      method: "POST",
      body: JSON.stringify(submission),
    }),

  accessCase: (caseNumber: string, code: string) =>
    request<{ case: import("../../../shared/types").CaseView }>("/api/cases/access", {
      method: "POST",
      body: JSON.stringify({ caseNumber, code }),
    }),

  addEvidence: (
    caseNumber: string,
    code: string,
    entry: import("../../../shared/types").EvidenceSubmission
  ) =>
    request<{ ok: boolean }>("/api/cases/evidence", {
      method: "POST",
      body: JSON.stringify({ caseNumber, code, ...entry }),
    }),

  deleteCase: (caseNumber: string, code: string) =>
    request<{ ok: boolean; message: string }>("/api/cases/delete", {
      method: "POST",
      body: JSON.stringify({ caseNumber, code }),
    }),

  countries: () => request<{ countries: import("../../../shared/types").CountryProfile[] }>("/api/countries"),
  country: (code: string) => request<{ country: import("../../../shared/types").CountryProfile }>(`/api/countries/${code}`),

  trust: () =>
    request<{
      casesTotal: number;
      criticalCases: number;
      evidenceCount: number;
      countriesTotal: number;
      countriesVerified: number;
      resourcesPublished: number;
      resourcesVerified: number;
      lessonsPublished: number;
      activePartnerships: number;
      disclaimer: string;
    }>("/api/trust"),

  aiChat: (messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string }>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),

  /** بثّ تدريجي: onDelta مع كل مقطع نصي، onThinking عند بدء التحليل — يعيد النموذج الذي أجاب فعلاً */
  aiChatStream: async (
    messages: { role: "user" | "assistant"; content: string }[],
    onDelta: (delta: string) => void,
    onThinking?: () => void
  ): Promise<{ model?: string }> => {
    const res = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok || !res.body) {
      let message = "تعذر بدء المحادثة";
      try {
        const d = (await res.json()) as { error?: string };
        if (d.error) message = d.error;
      } catch { /* استجابة غير JSON */ }
      throw new Error(message);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let model: string | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(trimmed.slice(5).trim()) as { delta?: string; error?: string; thinking?: boolean; done?: boolean; model?: string };
          if (evt.error) throw new Error(evt.error);
          if (evt.thinking && onThinking) onThinking();
          if (evt.delta) onDelta(evt.delta);
          if (evt.done && evt.model) model = evt.model;
        } catch (e) {
          if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }
    return { model };
  },
};

/** SHA-1 محلياً عبر WebCrypto — لفحص التسريبات دون إرسال البريد */
export async function sha1Upper(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
