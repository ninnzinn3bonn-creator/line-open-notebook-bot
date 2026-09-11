import { describe, expect, it } from "vitest";
import { MockAnswerProvider } from "../../bridge/src/providers/mock-answer-provider.js";
import { TimeoutAnswerProvider } from "../../bridge/src/providers/timeout-answer-provider.js";

describe("TimeoutAnswerProvider", () => {
  it("rejects a provider call that exceeds the configured deadline", async () => {
    const provider = new TimeoutAnswerProvider(new MockAnswerProvider(30), 5);
    await expect(provider.answer({ message: "test", userId: "u" })).rejects.toThrow("timed out");
  });
});
