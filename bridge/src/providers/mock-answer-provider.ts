import type { AnswerInput, AnswerProvider, AnswerResult } from "./answer-provider.js";

export class MockAnswerProvider implements AnswerProvider {
  constructor(private readonly delayMs = 10) {}

  async answer(input: AnswerInput): Promise<AnswerResult> {
    const startedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return {
      text: `Mock response: ${input.message}`,
      latencyMs: Math.round(performance.now() - startedAt),
      model: { provider: "mock", model: "deterministic-v1" }
    };
  }
}

