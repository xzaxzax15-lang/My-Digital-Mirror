import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(8).default("dev-only-secret-change-me"),
  ADMIN_USERNAME: z.string().min(3).default("admin"),
  ADMIN_PASSWORD: z.string().min(6).default("change-me-in-production"),
  AI_PROVIDER: z.enum(["none", "openai-compatible"]).default("none"),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_MAX_TOKENS_PER_RESPONSE: z.coerce.number().int().positive().default(1200),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  HIBP_API_KEY: z.string().optional(),
  RESEARCH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // المستشار الذكي — مزود مجاني افتراضي بلا مفتاح (Pollinations)، قابل للاستبدال بأي نقطة نهاية متوافقة OpenAI
  CHAT_BASE_URL: z.string().url().default("https://text.pollinations.ai/openai"),
  // "openai" يبث المحتوى مباشرة (~16 ث مُثبت)؛ "openai-fast" نموذج تفكير بطيء البدء — احتياطي فقط
  CHAT_MODEL: z.string().min(1).default("openai"),
  CHAT_FALLBACK_MODEL: z.string().min(1).default("openai-fast"),
  CHAT_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  // تكاملات الفاحص الشامل — كلها اختيارية وتظهر حالة "معطل" بصدق بدونها
  VT_API_KEY: z.string().optional(),
  GSB_API_KEY: z.string().optional(),
  URLHAUS_AUTH_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { isProd: boolean };

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return { ...parsed.data, isProd: parsed.data.NODE_ENV === "production" };
}

/** نطاقات البحث المسموح بها (سجل المصادر المعتمدة) */
export const RESEARCH_ALLOWLIST = [
  "haveibeenpwned.com",
  "www.facebook.com",
  "help.instagram.com",
  "faq.whatsapp.com",
  "telegram.org",
  "accounts.google.com",
  "myaccount.google.com",
  "account.live.com",
  "iforgot.apple.com",
  "support.snapchat.com",
  "help.twitter.com",
  "support.tiktok.com",
  "stopncii.org",
  "takeitdown.ncmec.org",
  "report.cybertip.com",
  "www.nomoreransom.org",
  "safety.google",
  "www.ncsc.gov.uk",
  "www.ic3.gov",
  "reportfraud.ftc.gov",
  "www.actionfraud.police.uk",
  "cert.gov.sa",
  "www.cert.om",
  "www.egcert.eg",
  "www.ncsc.gov.bh",
];
