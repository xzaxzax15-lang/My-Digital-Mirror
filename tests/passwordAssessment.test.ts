import { describe, expect, it } from "vitest";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { dictionary as commonDict, adjacencyGraphs as commonGraphs } from "@zxcvbn-ts/language-common";
import { dictionary as enDict, translations as enTranslations } from "@zxcvbn-ts/language-en";
import {
  assessmentQuestions,
  MAX_ASSESSMENT_SCORE,
  scoreAssessment,
} from "../shared/content/assessment.js";

// نفس تهيئة الواجهة — للتأكد أن التقييم المحلي يعمل بذات السلوك
zxcvbnOptions.setOptions({
  dictionary: { ...commonDict, ...enDict },
  graphs: commonGraphs,
  translations: enTranslations,
});

describe("مقياس قوة كلمات المرور (محلي بالكامل)", () => {
  it("كلمات شائعة تقييمها الصف الأدنى", () => {
    expect(zxcvbn("123456").score).toBe(0);
    expect(zxcvbn("password").score).toBe(0);
    expect(zxcvbn("qwerty").score).toBeLessThanOrEqual(1);
  });

  it("عبارة طويلة غير متوقعة تقييمها مرتفع", () => {
    expect(zxcvbn("قهوة-زاجل-مزرعة-77-قمر").score).toBeGreaterThanOrEqual(3);
  });

  it("الاستبدالات المتوقعة لا تنقذ الكلمة الضعيفة", () => {
    expect(zxcvbn("P@ssw0rd!").score).toBeLessThanOrEqual(1);
  });

  it("التكرار والتسلسل ضعيفة", () => {
    expect(zxcvbn("aaaaaaaaaa").score).toBeLessThanOrEqual(1);
    expect(zxcvbn("abcdef123456").score).toBeLessThanOrEqual(2);
  });
});

describe("التقييم الذاتي", () => {
  it("الحد الأقصى مطابق لمجموع أفضل الخيارات", () => {
    expect(MAX_ASSESSMENT_SCORE).toBe(assessmentQuestions.length * 10);
  });

  it("أسوأ الإجابات → مستوى ضعيف وخطة تحسين", () => {
    const answers = Object.fromEntries(assessmentQuestions.map((q) => [q.id, 0]));
    const r = scoreAssessment(answers);
    expect(r.band).toBe("weak");
    expect(r.percent).toBe(0);
    expect(r.improvements.length).toBeGreaterThan(0);
    expect(r.sevenDayPlan.length).toBe(7);
  });

  it("أفضل الإجابات → مستوى قوي ونقاط قوة", () => {
    const answers = Object.fromEntries(assessmentQuestions.map((q) => [q.id, q.options.length - 1]));
    const r = scoreAssessment(answers);
    expect(r.band).toBe("strong");
    expect(r.percent).toBe(100);
    expect(r.strengths.length).toBeGreaterThan(0);
  });

  it("الأسئلة عشرة وكل سؤال له أربعة خيارات متدرجة", () => {
    expect(assessmentQuestions.length).toBe(10);
    for (const q of assessmentQuestions) {
      expect(q.options.length).toBe(4);
      const pts = q.options.map((o) => o.points);
      expect(new Set(pts).size).toBe(4); // قيم متمايزة
    }
  });
});
