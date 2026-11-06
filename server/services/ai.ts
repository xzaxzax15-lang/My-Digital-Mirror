import type { Env } from "../config.js";
import type { IncidentPlan } from "../../shared/types.js";
import { logWarn } from "../security.js";

/**
 * محوّل مزود الذكاء الاصطناعي — اختياري تماماً.
 * عند غيابه أو فشله يعمل المساعد بمحرك الأدلة الإرشادية الحتمي بالكامل.
 * الخطة المنظمة (الخطوات والروابط) تُبنى دائماً من المحتوى الموثق —
 * دور النموذج مقصور على صياغة الرسالة التعاطفية الشخصية.
 */

export interface AiEnhanceInput {
  userMessage: string;
  plan: IncidentPlan;
  historyBrief: string;
}

const SYSTEM_PROMPT = `أنت مساعد دعم في منصة «مرآتي الرقمية» للأمن السيبراني بالعربية.
قواعد صارمة:
- تعاطف صادق موجز دون مبالغة، دون تشخيص نفسي، ولوم الضحية ممنوع نهائياً.
- لا تخترع أي خطوة أو رابط أو نتيجة فحص أو مصدراً. استخدم فقط الخطوات والروابط المعطاة لك في الخطة.
- لا تطلب أبداً كلمة مرور أو رمز تحقق أو بيانات بطاقة.
- إن كان في رسالة المستخدم خطر جسدي وشيك فأول توجيه هو طوارئ البلد أو شخص قريب موثوق.
- أعد صياغة موجزة (بحد 180 كلمة) تقدمها لخطة الخطوات المعطاة، بنبرة هادئة واثقة.
- أجب بالعربية الفصحى الميسرة.`;

export async function enhanceMessage(
  env: Env,
  input: AiEnhanceInput
): Promise<string | null> {
  if (env.AI_PROVIDER !== "openai-compatible" || !env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
  try {
    const planBrief = input.plan.phases
      .map((p) => `${p.label}: ${p.steps.slice(0, 2).map((st) => st.what).join(" | ")}`)
      .join("\n");
    const res = await fetch(`${env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: env.AI_MAX_TOKENS_PER_RESPONSE,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `رسالة المستخدم: ${input.userMessage}\n\nسياق موجز: ${input.historyBrief}\n\nالخطة الموثقة (المصدر الوحيد المسموح):\n${input.plan.title} — أولوية ${input.plan.urgency}\n${planBrief}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      logWarn("ai_adapter_http_error", { status: res.status });
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content.length < 10 || content.length > 4000) {
      return null;
    }
    return content;
  } catch (e) {
    logWarn("ai_adapter_failed", { error: e instanceof Error ? e.constructor.name : "unknown" });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
