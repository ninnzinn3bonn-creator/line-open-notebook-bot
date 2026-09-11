import type { ConversationStore } from "../db/conversation-store.js";
import type { AnswerInput, AnswerProvider, AnswerResult, ConversationTurn } from "./answer-provider.js";

export const CONVERSATION_REVISION = "three-rallies-v001";
const RESET_PATTERN = /^(?:会話|話|履歴|文脈)?(?:を)?(?:リセット|クリア|やり直し)(?:して|してください)?[。.!！]*$/u;
const CONTEXT_DEPENDENT_PATTERN = /(?:それ|その|これ|この|あれ|同じ|さっき|先ほど|前の|場合|ほう|方は|土曜も|日曜も|平日も)/u;

export class ConversationMemoryProvider implements AnswerProvider {
  constructor(private readonly inner: AnswerProvider, private readonly store: ConversationStore) {}

  async answer(input: AnswerInput): Promise<AnswerResult> {
    if (RESET_PATTERN.test(input.message.trim())) {
      this.store.reset(input.userId);
      return {
        text: "会話をリセットしました。新しいお問い合わせをお聞かせください。",
        latencyMs: 0,
        route: "deterministic",
        promptRevision: CONVERSATION_REVISION,
        model: { provider: "bridge", model: "deterministic-reset-v1" }
      };
    }

    const context = this.store.getOrCreate(input.userId);
    const searchMessage = buildContextualSearchMessage(input.message, context.turns);
    const answer = await this.inner.answer({ ...input, conversationId: context.conversationId, context: context.turns, searchMessage });
    this.store.appendRally(context, input.message, answer);
    return answer;
  }
}

export function buildContextualSearchMessage(message: string, turns: ConversationTurn[]): string {
  if (!CONTEXT_DEPENDENT_PATTERN.test(message) || turns.length === 0) return message;
  const previousQuestion = [...turns].reverse().find((turn) => turn.role === "user")?.text;
  return previousQuestion ? `${previousQuestion}\n続きの質問: ${message}` : message;
}
