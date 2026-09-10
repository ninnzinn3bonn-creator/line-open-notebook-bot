export type SourceReference = {
  id?: string;
  title?: string;
  excerpt?: string;
};

export type AnswerInput = {
  message: string;
  userId: string;
};

export type AnswerResult = {
  text: string;
  sources?: SourceReference[];
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: { provider?: string; model?: string };
};

export interface AnswerProvider {
  answer(input: AnswerInput): Promise<AnswerResult>;
}

