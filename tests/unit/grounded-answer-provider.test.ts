import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { ReviewQueue } from "../../bridge/src/db/review-queue.js";
import { GroundedAnswerProvider } from "../../bridge/src/providers/grounded-answer-provider.js";
import type { AnswerProvider } from "../../bridge/src/providers/answer-provider.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function setup(score: number, inner: AnswerProvider = { answer: vi.fn(async () => ({ text: "回答", latencyMs: 1 })) }) {
  const directory = mkdtempSync(join(tmpdir(), "grounding-"));
  directories.push(directory);
  const database = initializeDatabase(join(directory, "queue.db"));
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    results: score ? [{ id: "source:s1", parent_id: "source:s1", title: "FAQ", similarity: score, matches: ["根拠"] }] : [],
    total_count: score ? 1 : 0,
    search_type: "vector"
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const provider = new GroundedAnswerProvider(inner, {
    baseUrl: "http://open-notebook:5055",
    answerThreshold: 0.7,
    outOfScopeThreshold: 0.6,
    reviewQueue: new ReviewQueue(database),
    outOfScopeText: "対象外です。",
    reviewText: "確認します。",
    fetch
  });
  return { database, provider, inner, fetch };
}

describe("GroundedAnswerProvider", () => {
  it("answers high-score questions and keeps search sources", async () => {
    const { database, provider, inner } = setup(0.8);
    const result = await provider.answer({ message: "営業時間は？", userId: "u1" });
    expect(inner.answer).toHaveBeenCalled();
    expect(result.route).toBe("in_scope");
    expect(result.sources).toEqual([{ id: "source:s1", title: "FAQ", excerpt: "根拠" }]);
    database.close();
  });

  it("returns a fixed response for clearly out-of-scope questions", async () => {
    const { database, provider, inner } = setup(0.56);
    const result = await provider.answer({ message: "Pythonを書いて", userId: "u1" });
    expect(inner.answer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ text: "対象外です。", route: "out_of_scope" });
    database.close();
  });

  it("queues boundary questions once for human review", async () => {
    const { database, provider, inner } = setup(0.65);
    await provider.answer({ message: "おすすめは？", userId: "u1" });
    const result = await provider.answer({ message: "おすすめは？", userId: "u1" });
    expect(inner.answer).not.toHaveBeenCalled();
    expect(result.route).toBe("needs_review");
    expect(database.prepare("SELECT count(*) count FROM review_requests").get()).toEqual({ count: 1 });
    database.close();
  });

  it("reviews store-related questions even when their score is low", async () => {
    const { database, provider, inner } = setup(0.5);
    const result = await provider.answer({ message: "店員の対応について相談したい", userId: "u2" });
    expect(inner.answer).not.toHaveBeenCalled();
    expect(result.route).toBe("needs_review");
    expect(database.prepare("SELECT reason FROM review_requests").get()).toEqual({ reason: "store_context_without_grounding" });
    database.close();
  });

  it("lets deterministic greetings bypass vector search", async () => {
    const inner: AnswerProvider = { answer: vi.fn(async () => ({ text: "こんにちは。", latencyMs: 1, route: "deterministic" as const })) };
    const { database, provider, fetch } = setup(0, inner);
    expect((await provider.answer({ message: "こんにちは", userId: "u1" })).text).toBe("こんにちは。");
    expect(fetch).not.toHaveBeenCalled();
    database.close();
  });
});
