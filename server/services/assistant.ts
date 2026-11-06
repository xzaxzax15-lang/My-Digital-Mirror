import type {
  AssistantState,
  ChatMessage,
  IncidentPlan,
  PlanPhase,
  Playbook,
  Urgency,
} from "../../shared/types.js";
import { getPlaybook } from "../../shared/content/playbooks-index.js";
import {
  assessUrgency,
  classifyIncident,
  detectControlStatus,
  hasDistress,
  hasEmergency,
  inCyberScope,
  involvesMinor,
  maxUrgency,
} from "./classifier.js";

const PHASE_LABELS: Record<PlanPhase, string> = {
  now: "ابدأ بها الآن",
  next: "بعد الخطوات الأولى",
  after: "عندما تستقر الأمور",
};

const URGENCY_LABELS: Record<Urgency, string> = {
  critical: "طارئة",
  high: "عالية",
  medium: "متوسطة",
  low: "عادية",
};

export interface AssistantReply {
  reply: ChatMessage;
  state: AssistantState;
}

const UNCERTAINTY_NOTE =
  "هذا تقييم مبدئي من كلامك، وليس تشخيصاً قاطعاً — سأعدّله كلما وضّحت أكثر.";

const NUDGES: string[] = [
  "ولا تنسَ: لا أحد يحتاج كلمة مرورك أو رمز التحقق مهما كانت منصبه. من يطلبهما، يكون غالباً طرف الخداع.",
  "خذ وقتهم في هذه الخطوات — القلق يدفع للسرعة، والسرعة هي ما يريده من يقف خلف الحادثة غالباً.",
  "إذا خرج أثناء الخطوات سؤال غامض أو رابط، أرسله لي هنا قبل أن تضغط عليه.",
  "المهم ألا تحذف شيئاً الآن: الرسائل واللقطات دليل قد تحتاجه لاحقاً حتى لو بدا الموقف بسيطاً.",
];

function nudge(seed: number): string {
  return NUDGES[seed % NUDGES.length]!;
}

function opener(urgency: Urgency, distress: boolean): string {
  switch (urgency) {
    case "critical":
      return distress
        ? "الموقف الذي وصفتَه شديد، وطبيعي تماماً أن يكون القلق كبيراً الآن."
        : "الوصف يوضح وضعاً يتطلب تحركاً سريعاً، وأنت في المكان الصحيح للبدء.";
    case "high":
      return distress
        ? "أفهم أن الوضع مرهق، وسنسير في هذه الخطوات واحدة واحدة دون استعجال زائد."
        : "الوضع يحتاج تعاملاً سريعاً، والخطوات أدناه مرتبة من الأهم فالأهم.";
    case "medium":
      return distress
        ? "شكراً لأنك وضّحت لي ما صار. سنحلّ الموقف بهدوء."
        : "الوضع قابل للمعالجة بخطوات واضحة، فلنبدأ.";
    default:
      return "سؤالك في محله، وهذه أهم ما تحتاج معرفته.";
  }
}

function buildPlan(
  playbook: Playbook,
  urgency: Urgency,
  urgencyReason: string,
  control?: "has_control" | "lost_control"
): IncidentPlan {
  const phases: IncidentPlan["phases"] = (["now", "next", "after"] as PlanPhase[]).map((phase) => {
    const base = playbook.steps[phase] ?? [];
    const extra =
      control === "lost_control"
        ? playbook.lostControlSteps?.[phase] ?? []
        : control === "has_control"
          ? playbook.hasControlSteps?.[phase] ?? []
          : [];
    const steps = phase === "now" ? [...extra, ...base] : [...base, ...extra];
    return { phase, label: PHASE_LABELS[phase], steps };
  });
  return {
    playbookId: playbook.id,
    title: playbook.title,
    urgency,
    urgencyReason,
    phases: phases.filter((p) => p.steps.length > 0),
    doNot: playbook.doNot ?? [],
    links: playbook.officialLinks ?? [],
    escalateNote: playbook.escalateNote,
  };
}

const OFF_TOPIC_REPLY =
  "أنا هنا لشيء واحد فقط: السلامة الرقمية. الحسابات المخترقة، الاحتيال، التصيد، الابتزاز، الخصوصية وما يدور حولها. " +
  "سؤالك يخرج عن هذا المجال — لكن إن كان في جهازك أو حساباتك أي شيء يقلقك، ابدأ الحديث وسأكون معك خطوة بخطوة.";

const INTAKE_REPLY =
  "أخبرني ما حدث بكلماتك: هل هو حساب انسحب منك، مبلغ خرج دون علمك، رسالة أو رابط شكك فيه، أو شيء آخر؟\n" +
  "سطر واحد يكفي لي أرسم لك الطريق، ويمكنك كتابة أي شيء بلا تفاصيل حساسة — لا كلمات مرور ولا رموز ولا أرقام بطاقات.";

const CONFIRM_REPLY = (p: Playbook) =>
  `يبدو أن ما يحدث لك أقرب إلى «${p.title}». إن كنت متأكداً من ذلك أجب بنعم، وإن كانت التفاصيل مختلفة صحّحها لي بكلماتك.`;

export function respond(messages: ChatMessage[], state: AssistantState): AssistantReply {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";
  const turnSeed = messages.filter((m) => m.role === "user").length;
  const newState: AssistantState = {
    ...state,
    urgency: state.urgency ?? "low",
  };

  // 1) خطر جسدي وشيك — قبل كل شيء
  if (hasEmergency(text)) {
    const reply: ChatMessage = {
      role: "assistant",
      content:
        "ما وصفته يخص سلامتك الجسدية مباشرة، وهذا يسبق أي شيء على الإنترنت.\n\n" +
        "اتصل بالطوارئ في بلدك الآن، أو أخبر شخصاً قريباً منك بمكانك — من واقعي لا الرقمي.\n\n" +
        "أما الرسائل والحسابات فتنتظر: لا تحذف ولا تحظر شيئاً بعد، فلن تضيع منك أي خطوة وأنا معك بمجرد أن تكون في أمان.",
      urgency: "critical",
    };
    newState.urgency = "critical";
    return { reply, state: newState };
  }

  // 2) فحص النطاق — أي رسالة تطابق إشارات الحوادث داخل النطاق بحكم التعريف
  const cyber = inCyberScope(text) || classifyIncident(text).bestScore > 0;
  if (!cyber && !newState.incidentType) {
    return {
      reply: { role: "assistant", content: OFF_TOPIC_REPLY, scopeRedirect: true },
      state: newState,
    };
  }

  // 3) محاولة تصنيف الواقعة / تحديثها
  const classification = classifyIncident(text);
  const clearMatch = classification.bestScore >= 2;
  const ambiguous =
    clearMatch &&
    classification.runnerUpScore > 0 &&
    classification.bestScore - classification.runnerUpScore <= 1;

  const affirm = ["نعم", "اي", "أي", "صح", "اكيد", "ايوه", "صحيح", "ا"].some((w) => text.trim().startsWith(w));

  const controlFromText = detectControlStatus(text);
  if (controlFromText) newState.controlStatus = controlFromText;

  if (clearMatch && classification.best) {
    newState.incidentType = classification.best.id;
  } else if (state.incidentType && affirm) {
    // أجاب بنعم على التأكيد — اقبل التصنيف السابق
  }

  const playbookId = newState.incidentType ?? state.incidentType;
  const playbook = playbookId ? getPlaybook(playbookId) : undefined;

  // لا يوجد تصنيف بعد
  if (!playbook) {
    return {
      reply: { role: "assistant", content: INTAKE_REPLY },
      state: newState,
    };
  }

  // غموض بين تصنيفين متقاربين — سؤال فارق واحد
  if (ambiguous && classification.best && classification.runnerUp && !state.askedClarifications) {
    newState.askedClarifications = true;
    const pre = assessUrgency(text, classification.best);
    newState.urgency = maxUrgency(pre.urgency, newState.urgency);
    return {
      reply: {
        role: "assistant",
        content:
          pre.urgency === "critical"
            ? `الموقف قد يكون طارئاً — ${pre.reason}. ولتحديد الطريق الصحيح مباشرة: أيهما أقرب لما يحدث لك، «${classification.best.title}» أم «${classification.runnerUp.title}»؟`
            : `أمامي احتمالان قريبان: «${classification.best.title}» و«${classification.runnerUp.title}». أيهما يصف وضعك بدقة أكبر؟ جملة قصيرة تكفي.`,
        questions: [`${classification.best.title} أم ${classification.runnerUp.title}؟`],
        urgency: newState.urgency,
      },
      state: newState,
    };
  }

  // تقييم الاستعجال (ويعاد تقييمه مع كل رسالة)
  const { urgency, reason } = assessUrgency(text, playbook);
  const finalUrgency = maxUrgency(urgency, state.urgency === "critical" ? "critical" : urgency);
  newState.urgency = finalUrgency;

  if (
    involvesMinor(text) &&
    (playbook.id === "sextortion" || playbook.id === "intimate_image_threat")
  ) {
    newState.urgency = "critical";
  }
  const effectiveUrgency = newState.urgency;
  const distress = hasDistress(text);
  const needsControlAnswer =
    (playbook.lostControlSteps || playbook.hasControlSteps) &&
    newState.controlStatus === undefined;

  // لم تُطرح الأسئلة التوضيحية بعد — سؤال واحد للمستخدم المضغوط، اثنان لغيره
  if (!state.askedClarifications && !state.deliveredPlan) {
    newState.askedClarifications = true;
    const questions = [...playbook.clarifyingQuestions];
    if (needsControlAnswer && questions.length < 2) {
      questions.push("هل ما زلت تفتح الحساب أو الجهاز نفسه الآن؟");
    }
    const take = distress ? questions.slice(0, 1) : questions.slice(0, 2);
    const intro =
      distress
        ? `${opener(effectiveUrgency, true)} سؤال واحد فقط الآن، وبعده مباشرة الخطوات:`
        : `${opener(effectiveUrgency, false)} أجبني باختصار لأضبط الخطوات على وضعك:`;
    return {
      reply: {
        role: "assistant",
        content:
          `${intro}\n` +
          take.map((q, i) => `${i + 1}. ${q}`).join("\n") +
          (distress ? "\n\nوبعد إجابتك مباشرة ستجد ما تفعله الآن، مرتّباً." : "") +
          `\n\n${UNCERTAINTY_NOTE}`,
        questions: take,
        incidentType: playbook.id,
        urgency: effectiveUrgency,
      },
      state: newState,
    };
  }

  // الخطة
  const control = newState.controlStatus === "unknown" ? undefined : newState.controlStatus;
  const plan = buildPlan(playbook, effectiveUrgency, reason, control);
  newState.deliveredPlan = true;

  const controlNote =
    control === undefined
      ? "\nلم تتضح لي صلاحيتك على الحساب أو الجهاز بعد — أخبرني، فالخطوات تختلف تماماً بين الحالتين."
      : "";

  const introText =
    effectiveUrgency === "critical"
      ? `هذه الخطوات مرتبة بما يوقف الضرر أولاً — ابدأ بالأولى واحداً واحداً ولا تشغل نفسك بالباقي حتى تنتهي منها.`
      : effectiveUrgency === "high"
        ? `ابدأ من السطر الأول ونزلاً؛ الخطوات كلها قصيرة لكن ترتيبها مهم.`
        : `لديك وقت لهذه الخطوات، فنفّذها بهدوء بالترتيب وعلّم على ما أنجزته.`;

  const reply: ChatMessage = {
    role: "assistant",
    content:
      `${opener(effectiveUrgency, distress)} ${introText}\n` +
      (controlNote ? `${controlNote}\n` : "") +
      `\n${nudge(turnSeed)}`,
    plan,
    incidentType: playbook.id,
    urgency: effectiveUrgency,
  };

  return { reply, state: newState };
}

// رسالة ما بعد الخطة — متابعة
export function followUp(messages: ChatMessage[], state: AssistantState): AssistantReply {
  const result = respond(messages, state);
  return result;
}
