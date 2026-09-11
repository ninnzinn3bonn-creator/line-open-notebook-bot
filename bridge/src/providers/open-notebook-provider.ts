import type { AnswerInput, AnswerProvider, AnswerResult } from "./answer-provider.js";

export type OpenNotebookProviderConfig = {
  baseUrl: string;
  strategyModelId: string;
  answerModelId: string;
  finalAnswerModelId: string;
  fetch?: typeof globalThis.fetch;
};

type AskResponse = { answer: string; question: string };

export class OpenNotebookProvider implements AnswerProvider {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly endpoint: string;

  constructor(private readonly config: OpenNotebookProviderConfig) {
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.endpoint = `${config.baseUrl.replace(/\/$/u, "")}/api/search/ask/simple`;
  }

  async answer(input: AnswerInput): Promise<AnswerResult> {
    const startedAt = performance.now();
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: input.message,
        strategy_model: this.config.strategyModelId,
        answer_model: this.config.answerModelId,
        final_answer_model: this.config.finalAnswerModelId
      })
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Open Notebook Ask failed (${response.status}): ${detail}`);
    }

    const payload = await response.json() as Partial<AskResponse>;
    if (typeof payload.answer !== "string" || !payload.answer.trim()) {
      throw new Error("Open Notebook Ask returned an invalid answer");
    }

    return {
      text: payload.answer.trim(),
      latencyMs: Math.round(performance.now() - startedAt),
      model: { provider: "groq", model: "openai/gpt-oss-120b" }
    };
  }
}

