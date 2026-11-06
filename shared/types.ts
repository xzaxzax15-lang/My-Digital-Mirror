// ============================================================
// الأنواع المشتركة بين الواجهة والخادم — Digital Mirror
// ============================================================

/** مستوى الاستعجال */
export type Urgency = "critical" | "high" | "medium" | "low";

/** حالة التحقق من المصدر */
export type VerificationStatus = "verified" | "unverified" | "pending";

export interface SourceRef {
  title: string;
  publisher: string;
  url: string;
  /** تاريخ آخر تحقق بالتنسيق ISO (اختياري — غيابه يعني "غير موثق بعد") */
  verifiedAt?: string;
  status: VerificationStatus;
}

/** خطوة إجرائية في خطة الاستجابة */
export interface ActionStep {
  what: string;
  why: string;
  verify: string;
  /** ماذا يفعل إن لم تنجح الخطوة */
  ifFailed?: string;
}

/** نوع الخطة المرحلية */
export type PlanPhase = "now" | "next" | "after";

/** دليل إرشادي لحادثة واحدة */
export interface Playbook {
  id: string;
  title: string;
  category: string;
  defaultUrgency: Urgency;
  /** كلمات دلالية عربية/إنجليزية للمطابقة */
  signals: string[];
  /** إشارات رفع الاستعجال إلى critical */
  criticalSignals?: string[];
  /** سؤالا التوضيح الأوليان (بحد أقصى اثنان في كل مرة) */
  clarifyingQuestions: string[];
  /** ينطبق عندما يفقد المستخدم التحكم في الحساب/الجهاز */
  lostControlSteps?: Partial<Record<PlanPhase, ActionStep[]>>;
  /** ينطبق عندما ما زال يملك التحكم */
  hasControlSteps?: Partial<Record<PlanPhase, ActionStep[]>>;
  /** خطوات عامة تنطبق في الحالتين */
  steps: Record<PlanPhase, ActionStep[]>;
  officialLinks?: SourceRef[];
  /** متى يتوجب الاتصال بالطوارئ أو الجهات الرسمية */
  escalateNote?: string;
  /** ما يجب عدم فعله */
  doNot?: string[];
}

/** درس في أكاديمية التوعية */
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  track: "beginner" | "intermediate" | "advanced";
  topic: string;
  objective: string;
  /** فقرات الشرح — كل فقرة عنوان + نص */
  sections: { heading: string; body: string }[];
  /** أمثلة توضيحية — تُعرض كمحتوى تعليمي آمن وليس روابط حية */
  examples: { label: string; safe: string; fake: string; note: string }[];
  quiz: QuizQuestion[];
  checklist: string[];
  minutes: number;
  order: number;
}

export interface VideoItem {
  id: string;
  title: string;
  source: string;
  url: string;
  durationMinutes?: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  topic: string;
  captionsAr: boolean;
  status: "published" | "pending_review";
  verifiedAt?: string;
  note?: string;
}

/** مورد رسمي في دليل الإبلاغ */
export interface OfficialResource {
  id: string;
  title: string;
  description: string;
  url: string;
  /** فئة المورد */
  kind: "account_recovery" | "abuse_report" | "cert" | "consumer" | "cybercrime" | "education";
  /** رمز الدولة ISO اختياري —-resources عالمية تظهر للجميع */
  countryCode?: string;
  countryName?: string;
  platforms: string[];
  incidentTypes: string[];
  status: VerificationStatus;
  verifiedAt?: string;
}

/** ===== المساعد ===== */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** بيانات منظمة اختيارية تُرفق برسالة المساعد */
  plan?: IncidentPlan;
  questions?: string[];
  incidentType?: string;
  urgency?: Urgency;
  scopeRedirect?: boolean;
}

export interface IncidentPlan {
  playbookId: string;
  title: string;
  urgency: Urgency;
  urgencyReason: string;
  phases: { phase: PlanPhase; label: string; steps: ActionStep[] }[];
  doNot: string[];
  links: SourceRef[];
  escalateNote?: string;
}

export interface AssistantState {
  incidentType?: string;
  urgency: Urgency;
  /** هل ما زال يملك التحكم في الحساب/الجهاز؟ */
  controlStatus?: "has_control" | "lost_control" | "unknown";
  askedClarifications: boolean;
  deliveredPlan: boolean;
}

/** ===== الأدوات ===== */

export interface BreachEntry {
  name: string;
  breachDate: string;
  exposedDataKinds: string[];
  verified: boolean;
}

export interface BreachResult {
  status: "found" | "not_found" | "unavailable";
  breaches: BreachEntry[];
  disclaimer: string;
  providerDisclosure: string;
}

export interface LinkFinding {
  severity: "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
}

export interface LinkAnalysis {
  inputKind: "url" | "message" | "unknown";
  url?: string;
  host?: string;
  registrableDomain?: string;
  findings: LinkFinding[];
  riskLevel: "high" | "medium" | "low" | "insufficient";
  confidence: string;
  nextSteps: string[];
  disclaimer: string;
}

/** ===== التقييم الذاتي ===== */

export interface AssessmentQuestion {
  id: string;
  text: string;
  options: { label: string; points: number }[];
  dimension: string;
}

export interface AssessmentResult {
  totalScore: number;
  maxScore: number;
  percent: number;
  band: "weak" | "fair" | "good" | "strong";
  bandLabel: string;
  strengths: string[];
  improvements: { dimension: string; advice: string }[];
  sevenDayPlan: string[];
}

/** ===== مركز حماية ضحايا الابتزاز ===== */

export type CaseStatus =
  | "NEW" | "TRIAGED" | "AWAITING_CONSENT" | "REFERRED"
  | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type EvidenceKind = "message" | "account" | "url" | "payment" | "other";

export interface ReportSubmission {
  incidentType: string;
  ongoing: boolean;
  publicationThreat: boolean;
  minorInvolved: boolean;
  physicalRisk: boolean;
  countryCode?: string;
  /** ما وافق المستخدم على تخزينه — لا بيانات هوية إطلاقاً */
  consentStore: boolean;
  /** ملخص حر اختياري بكلمات المستخدم (حد أقصى 500 حرف) */
  summary?: string;
}

export interface CaseCreated {
  caseNumber: string;
  followupCode: string;
}

export interface CaseEventView {
  type: string;
  note: string;
  at: string;
}

export interface EvidenceEntryView {
  id: number;
  kind: EvidenceKind;
  platform?: string;
  occurredAt?: string;
  timezone?: string;
  description: string;
  sha256?: string;
  createdAt: string;
}

export interface CaseView {
  caseNumber: string;
  status: CaseStatus;
  statusLabel: string;
  severity: Urgency;
  incidentType: string;
  incidentTitle: string;
  ongoing: boolean;
  minorInvolved: boolean;
  physicalRisk: boolean;
  publicationThreat: boolean;
  countryCode?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  events: CaseEventView[];
  evidence: EvidenceEntryView[];
  custodyLog: { action: string; actor: string; at: string }[];
}

export interface EvidenceSubmission {
  kind: EvidenceKind;
  platform?: string;
  occurredAt?: string;
  timezone?: string;
  description: string;
  /** بصمة SHA-256 يحسبها المستخدم محلياً — لا نستقبل الملف نفسه أبداً */
  sha256?: string;
}

/** ===== شبكة الدول العربية ===== */

export type VerifyStatus = "VERIFIED" | "PENDING_REVIEW" | "OUTDATED" | "UNAVAILABLE" | "DISPUTED";

export interface CountryEntity {
  name?: string;
  url?: string;
  status: VerifyStatus;
  verifiedAt?: string;
  source?: string;
}

export interface CountryProfile {
  code: string;           // ISO 3166-1 alpha-2
  nameAr: string;
  nameEn: string;
  region: "الخليج" | "المشرق" | "وادي النيل" | "المغرب" | "قرن أفريقيا";
  /** لا نملأ أي جهة إلا بمعلومة منشورة رسمياً ويمكن التحقق منها */
  cert?: CountryEntity;
  cybercrime?: CountryEntity;
  childProtection?: CountryEntity;
  emergencyNote?: string;
  lastReviewed: string;
}
