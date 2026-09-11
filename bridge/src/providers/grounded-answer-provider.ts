import type { ReviewQueue } from "../db/review-queue.js";
import type { AnswerInput, AnswerProvider, AnswerResult, SourceReference } from "./answer-provider.js";
import { isDeterministicGreeting } from "./answer-policy-provider.js";

export const GROUNDING_REVISION = "vector-gate-v001";
const STORE_CONTEXT_PATTERN = /(?:店|店舗|商品|在庫|取扱|取り扱|予約|注文|配送|送料|返品|返金|交換|支払|決済|営業時間|休業|住所|場所|アクセス|駐車|電話|スタッフ|店員|接客|苦情|要望|ポイント|領収書|包装|トイレ|wi-?fi|ペット|車椅子)/iu;

type SearchItem = {
  id?: string;
  parent_id?: string;
  title?: string;
  similarity?: number;
  matches?: string[];
};
type SearchResponse = { results: SearchItem[]; total_count: number; search_type: string };

export type GroundedAnswerConfig = {
  baseUrl: string;
  answerThreshold: number;
  outOfScopeThreshold: number;
  reviewQueue: ReviewQueue;
  outOfScopeText: string;
  reviewText: string;
  fetch?: typeof globalThis.fetch;
};

export class GroundedAnswerProvider implements AnswerProvider {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly endpoint: string;

  constructor(private readonly inner: AnswerProvider, private readonly config: GroundedAnswerConfig) {
    if (config.outOfScopeThreshold >= config.answerThreshold) {
      throw new Error("GROUNDING_OUT_OF_SCOPE_THRESHOLD must be lower than GROUNDING_ANSWER_THRESHOLD");
    }
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.endpoint = `${config.baseUrl.replace(/\/$/u, "")}/api/search`;
  }

  async answer(input: AnswerInput): Promise<AnswerResult> {
    if (isDeterministicGreeting(input.message)) return this.inner.answer(input);
    const startedAt = performance.now();
    const searchQuery = input.searchMessage ?? input.message;
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: searchQuery, type: "vector", limit: 5, search_sources: true, search_notes: false, minimum_score: 0 })
    });
    if (!response.ok) throw new Error(`Open Notebook Search failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as SearchResponse;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const topScore = results.reduce((best, item) => Math.max(best, Number(item.similarity) || 0), 0);
    const grounding = { topScore, revision: GROUNDING_REVISION };

    if (topScore <= this.config.outOfScopeThreshold && !STORE_CONTEXT_PATTERN.test(input.message)) {
      return { text: this.config.outOfScopeText, latencyMs: Math.round(performance.now() - startedAt), route: "out_of_scope", grounding };
    }
    if (topScore < this.config.answerThreshold) {
      const reason = topScore <= this.config.outOfScopeThreshold ? "store_context_without_grounding" : "grounding_score_boundary";
      this.config.reviewQueue.enqueue({ userId: input.userId, message: input.message, reason, topScore, searchResults: results });
      return { text: this.config.reviewText, latencyMs: Math.round(performance.now() - startedAt), route: "needs_review", grounding };
    }

    const answer = await this.inner.answer({ ...input, message: searchQuery });
    return { ...answer, route: "in_scope", grounding, sources: mergeSearchSources(answer.sources, results) };
  }
}

function mergeSearchSources(existing: SourceReference[] | undefined, results: SearchItem[]): SourceReference[] {
  const merged = new Map<string, SourceReference>();
  for (const source of existing ?? []) if (source.id) merged.set(source.id, source);
  for (const result of results) {
    const id = result.parent_id ?? result.id;
    if (id) merged.set(id, { id, title: result.title, excerpt: result.matches?.[0] });
  }
  return [...merged.values()];
}
