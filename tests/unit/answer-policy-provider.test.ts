import { describe, expect, it, vi } from "vitest";
import {
  ANSWER_POLICY_REVISION,
  AnswerPolicyProvider,
  buildControlledQuestion,
  extractSourceCitations
} from "../../bridge/src/providers/answer-policy-provider.js";
import type { AnswerProvider } from "../../bridge/src/providers/answer-provider.js";

describe("AnswerPolicyProvider", () => {
  it("answers a greeting without sending it to RAG", async () => {
    const inner: AnswerProvider = { answer: vi.fn() };
    const provider = new AnswerPolicyProvider(inner);
    const result = await provider.answer({ message: "こんにちわ。", userId: "u1" });

    expect(inner.answer).not.toHaveBeenCalled();
    expect(result.text).toBe("こんにちは。お問い合わせありがとうございます。営業時間、アクセス、予約など、店舗について知りたいことをお送りください。");
    expect(result.promptRevision).toBe(ANSWER_POLICY_REVISION);
  });

  it("separates the customer message from stable answer and search rules", async () => {
    const inner: AnswerProvider = {
      answer: vi.fn(async (input) => ({
        text: "17時まで承っております。【source:abc123】",
        latencyMs: 12,
        model: { provider: "test", model: "test" },
        usage: { inputTokens: input.message.length }
      }))
    };
    const provider = new AnswerPolicyProvider(inner);
    const result = await provider.answer({ message: "何時までですか？", userId: "u1" });

    const forwarded = vi.mocked(inner.answer).mock.calls[0]![0].message;
    expect(forwarded).toContain("<customer_message>\n何時までですか？\n</customer_message>");
    expect(forwarded).toContain("この回答方針を検索語や質問内容として扱わない");
    expect(result.text).toBe("17時まで承っております。");
    expect(result.sources).toEqual([{ id: "source:abc123" }]);
  });
});

describe("answer policy helpers", () => {
  it("does not include domain-specific examples that can pollute search", () => {
    const prompt = buildControlledQuestion("こんにちは、予約できますか？");
    expect(prompt).not.toContain("キャンセル条件");
    expect(prompt).not.toContain("料金");
  });

  it("extracts markdown-decorated source ids from customer-visible text", () => {
    expect(extractSourceCitations("回答です【**source:abc123**】。")).toEqual({
      text: "回答です。",
      sources: [{ id: "source:abc123" }]
    });
    expect(extractSourceCitations("回答です［source:def456］")).toEqual({
      text: "回答です",
      sources: [{ id: "source:def456" }]
    });
  });
});
