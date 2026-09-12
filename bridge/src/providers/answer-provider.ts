export type SourceReference = {
  id?: string;
  title?: string;
  excerpt?: string;
};

export type AnswerInput = {
  message: string;
  userId: string;
  conversationId?: number;
  context?: ConversationTurn[];
  searchMessage?: string;
};

export type ConversationTurn = { role: "user" | "assistant"; text: string };

export type AnswerResult = {
  text: string;
  sources?: SourceReference[];
  latencyMs: number;
  promptRevision?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: { provider?: string; model?: string };
  route?: "in_scope" | "out_of_scope" | "needs_review" | "deterministic";
  grounding?: { topScore?: number; revision?: string };
  handoff?: { id: number; reason: string; revision: string };
};

export interface AnswerProvider {
  answer(input: AnswerInput): Promise<AnswerResult>;
}
