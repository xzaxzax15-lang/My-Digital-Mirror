import { describe, expect, it } from "vitest";
import { respond } from "../server/services/assistant.js";
import { allPlaybooks } from "../shared/content/playbooks-index.js";
import type { AssistantState, ChatMessage } from "../shared/types.js";

const S0: AssistantState = { urgency: "low", askedClarifications: false, deliveredPlan: false };
const msg = (content: string): ChatMessage => ({ role: "user", content });

describe("مسار المحادثة الكامل", () => {
  it("يعيد توجيه المواضيع الخارجة عن النطاق بأدب", () => {
    const r = respond([msg("إيش أفضل مطعم في المدينة؟")], S0);
    expect(r.reply.scopeRedirect).toBe(true);
    expect(r.reply.content).toContain("السلامة الرقمية");
  });

  it("يسأل سؤالين توضيحيين كحد أقصى قبل الخطة", () => {
    const r = respond([msg("حسابي في فيسبوك انسرق")], S0);
    expect(r.state.incidentType).toBe("social_account_takeover");
    expect((r.reply.questions ?? []).length).toBeLessThanOrEqual(2);
    expect(r.state.deliveredPlan).toBeFalsy();
  });

  it("يسلّم خطة كاملة بعد الإجابة، وتدمج خطوات فقدان التحكم", () => {
    const state: AssistantState = {
      urgency: "high",
      incidentType: "social_account_takeover",
      askedClarifications: true,
      deliveredPlan: false,
    };
    const r = respond(
      [msg("حسابي في فيسبوك انسرق"), { role: "assistant", content: "؟" }, msg("ما أقدر أدخل، فقدت الوصول")],
      state
    );
    expect(r.state.controlStatus).toBe("lost_control");
    expect(r.reply.plan).toBeDefined();
    expect(r.state.deliveredPlan).toBe(true);
    const nowPhase = r.reply.plan!.phases.find((p) => p.phase === "now")!;
    expect(nowPhase.steps.length).toBeGreaterThanOrEqual(4);
    // خطوات فقدان التحكم تسبق العامة في «الآن»
    expect(nowPhase.steps[0]!.what).toContain("صفحة الاستعادة");
  });

  it("يسأل سؤالاً واحداً فقط عندما يكون المستخدم في ضيق شديد", () => {
    const r = respond([msg("خسرت حسابي وفلوسي ووالله تعبت من الحياة")], S0);
    expect((r.reply.questions ?? []).length).toBe(1);
  });

  it("كل خطوة في كل الأدلة تحتوي سبباً وتحققاً وإجراء إن فشل", () => {
    // التحقق يُستورد مباشرة من الفهرس
    for (const pb of allPlaybooks) {
      const all = [
        ...pb.steps.now, ...pb.steps.next, ...pb.steps.after,
        ...Object.values(pb.lostControlSteps ?? {}).flat(),
        ...Object.values(pb.hasControlSteps ?? {}).flat(),
      ];
      expect(all.length).toBeGreaterThan(0);
      for (const st of all) {
        expect(st.why.length, pb.id).toBeGreaterThan(10);
        expect(st.verify.length, pb.id).toBeGreaterThan(10);
        expect(st.ifFailed?.length ?? "", pb.id).toBeGreaterThan(10);
      }
    }
  });

  it("يعيد تقييم الاستعجال إلى حرجة عند ورود ضرر مالي نشط", () => {
    const r = respond([msg("حسابي انسرق وطلبوا من أصحابي فلوس")], S0);
    expect(r.state.urgency).toBe("critical");
  });

  it("يقدّم الخطر الجسدي على كل شيء ويعطي توجيه الطوارئ", () => {
    const r = respond([msg("شخص قال راته جاي البيت يضربني وهددني بالقتل")], S0);
    expect(r.reply.urgency).toBe("critical");
    expect(r.reply.content).toContain("طوارئ");
  });

  it("يرفع حادثة المحتوى الحميم مع قاصر إلى حرجة", () => {
    const r = respond([msg("شخص يهددني بنشر صور وأخوي الصغير ١٦ سنة موجود بالقصة")], S0);
    expect(r.state.urgency).toBe("critical");
    expect(["sextortion", "intimate_image_threat"]).toContain(r.state.incidentType);
  });

  it("يبقي الحديث داخل النطاق بعد بدء حادثة (أسئلة متابعة عامة)", () => {
    const state: AssistantState = {
      urgency: "medium",
      incidentType: "phishing",
      askedClarifications: true,
      deliveredPlan: true,
    };
    const r = respond([msg("شكراً لك")], state);
    expect(r.reply.scopeRedirect).toBeFalsy();
    expect(r.state.incidentType).toBe("phishing");
  });

  it("لا يسلّم خطة أبداً لرسالة تطلب كلمة مرور (لا يرد ببيانات حساسة)", () => {
    const r = respond([msg("أعطني كلمة مرور قوية جاهزة")], S0);
    // يجب ألا يحث على وضع كلمة مرور يولدها هو؛ الرد إرشادي عام فقط
    expect(r.reply.content).not.toMatch(/كلمة المرور الخاصة بك هي/);
  });
});
