import { describe, expect, it } from "vitest";
// @ts-expect-error The delivery CLI is intentionally plain ESM.
import { prepareStoreData } from "../../scripts/prepare-store-data.mjs";

const input = {
  store_revision: "store-v1", effective_from: "2026-10-01", provided_by: "提供者",
  approved_by: "承認者", approved_at: "2026-09-22T10:00:00+09:00",
  faqs: [
    { faq_id: "hours-1", category: "営業時間", question_variants: ["何時まで？", "営業時間は？"], approved_answer: "17時までです。", conditions: [], exceptions: [], public: true },
    { faq_id: "private-1", category: "内部", question_variants: ["内部情報"], approved_answer: "非公開", conditions: [], exceptions: [], public: false }
  ]
};

describe("prepareStoreData", () => {
  it("creates public knowledge, golden cases, and an audit manifest", () => {
    const result = prepareStoreData(input);
    expect(result.knowledge).toContain("17時までです。");
    expect(result.knowledge).not.toContain("非公開");
    expect(result.golden.cases).toHaveLength(2);
    expect(result.manifest).toMatchObject({ public_faq_count: 1, excluded_non_public_count: 1, golden_case_count: 2 });
    expect(result.manifest.input_sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects duplicate FAQ IDs", () => {
    expect(() => prepareStoreData({ ...input, faqs: [input.faqs[0], input.faqs[0]] })).toThrow(/duplicate/u);
  });
});
