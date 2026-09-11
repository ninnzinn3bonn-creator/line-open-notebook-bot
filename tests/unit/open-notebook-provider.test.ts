import { describe, expect, it, vi } from "vitest";
import { OpenNotebookProvider } from "../../bridge/src/providers/open-notebook-provider.js";

describe("OpenNotebookProvider", () => {
  it("uses the non-streaming Ask endpoint with explicit model record IDs", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ answer: "17時までです。", question: "営業時間は？" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const provider = new OpenNotebookProvider({
      baseUrl: "http://open-notebook:5055/",
      strategyModelId: "model:strategy",
      answerModelId: "model:answer",
      finalAnswerModelId: "model:final",
      fetch
    });

    const result = await provider.answer({ message: "営業時間は？", userId: "u1" });

    expect(result.text).toBe("17時までです。");
    expect(result.model).toEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
    expect(fetch).toHaveBeenCalledWith("http://open-notebook:5055/api/search/ask/simple", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        question: "営業時間は？",
        strategy_model: "model:strategy",
        answer_model: "model:answer",
        final_answer_model: "model:final"
      })
    }));
  });

  it("fails on an invalid or unsuccessful response", async () => {
    const provider = new OpenNotebookProvider({
      baseUrl: "http://open-notebook:5055",
      strategyModelId: "m1",
      answerModelId: "m1",
      finalAnswerModelId: "m1",
      fetch: vi.fn(async () => new Response("rate limited", { status: 429 }))
    });
    await expect(provider.answer({ message: "質問", userId: "u1" })).rejects.toThrow("(429)");
  });
});
