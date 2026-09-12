import type { HandoffQueue, HandoffReason } from "../db/handoff-queue.js";
import type { AnswerInput, AnswerProvider, AnswerResult } from "./answer-provider.js";

export const HUMAN_HANDOFF_REVISION = "human-handoff-v001";
const HUMAN_REQUEST_PATTERN = /(?:担当者|スタッフ|店員|責任者|オペレーター|有人).*(?:代わ|話|相談|対応)|電話したい|(?:人|電話).*(?:話したい|相談したい|つないで|繋いで)/u;
const HIGH_RISK_PATTERN = /(?:予約|注文|取り置き).*(?:確定|成立|手配|申し込んで|取って)|(?:返金|払い戻し).*(?:確定|して|してください|認めて)|(?:個別|正式).*(?:見積|金額)|(?:期限|期間).*(?:過ぎ|超え).*(?:キャンセル|返品|返金)|(?:例外|特別).*(?:キャンセル|返品|返金)/u;

export type HumanHandoffConfig = {
  queue: HandoffQueue;
  answerText: string;
  phone?: string;
  hours?: string;
  chatUrl?: string;
};

export class HumanHandoffProvider implements AnswerProvider {
  constructor(private readonly inner: AnswerProvider, private readonly config: HumanHandoffConfig) {}

  async answer(input: AnswerInput): Promise<AnswerResult> {
    const reason = classifyHandoff(input.message);
    if (!reason) return this.inner.answer(input);
    const startedAt = performance.now();
    const record = this.config.queue.enqueue({
      userId: input.userId,
      conversationId: input.conversationId,
      message: input.message,
      reason
    });
    return {
      text: buildHandoffAnswer(this.config),
      latencyMs: Math.round(performance.now() - startedAt),
      route: "needs_review",
      promptRevision: HUMAN_HANDOFF_REVISION,
      model: { provider: "bridge", model: "deterministic-human-handoff-v1" },
      handoff: { id: record.id, reason, revision: HUMAN_HANDOFF_REVISION }
    };
  }
}

export function classifyHandoff(message: string): HandoffReason | undefined {
  const normalized = message.normalize("NFKC").trim();
  if (HUMAN_REQUEST_PATTERN.test(normalized)) return "customer_requested_human";
  if (HIGH_RISK_PATTERN.test(normalized)) return "high_risk_or_commitment";
  return undefined;
}

function buildHandoffAnswer(config: HumanHandoffConfig): string {
  const parts = [config.answerText.trim()];
  if (config.phone?.trim()) parts.push(`お電話は${config.phone.trim()}へお願いいたします${config.hours?.trim() ? `（受付時間：${config.hours.trim()}）` : ""}。`);
  if (config.chatUrl?.trim()) parts.push(`有人チャット：${config.chatUrl.trim()}`);
  return parts.filter(Boolean).join(" ");
}
