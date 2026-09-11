import type { AnswerInput, AnswerProvider, AnswerResult } from "./answer-provider.js";

export class TimeoutAnswerProvider implements AnswerProvider {
  constructor(private readonly inner: AnswerProvider, private readonly timeoutMs: number) {}

  async answer(input: AnswerInput): Promise<AnswerResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.inner.answer(input),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`Answer provider timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
