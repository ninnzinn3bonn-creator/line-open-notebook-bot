import { describe, expect, it } from "vitest";
import { MockAnswerProvider } from "../../bridge/src/providers/mock-answer-provider.js";

describe("MockAnswerProvider", () => {
  it("returns a deterministic answer and model metadata", async () => {
    const result = await new MockAnswerProvider(0).answer({ message: "営業時間は？", userId: "u-1" });
    expect(result.text).toBe("Mock response: 営業時間は？");
    expect(result.model).toEqual({ provider: "mock", model: "deterministic-v1" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

