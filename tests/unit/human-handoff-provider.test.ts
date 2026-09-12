import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { HandoffQueue } from "../../bridge/src/db/handoff-queue.js";
import { HumanHandoffProvider, classifyHandoff } from "../../bridge/src/providers/human-handoff-provider.js";
import type { AnswerProvider } from "../../bridge/src/providers/answer-provider.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "handoff-"));
  directories.push(directory);
  const database = initializeDatabase(join(directory, "queue.db"));
  const inner: AnswerProvider = { answer: vi.fn(async () => ({ text: "通常回答", latencyMs: 1 })) };
  const queue = new HandoffQueue(database);
  const provider = new HumanHandoffProvider(inner, {
    queue,
    answerText: "担当者による確認が必要です。",
    phone: "000-0000-0000",
    hours: "10:00〜16:00"
  });
  return { database, inner, provider, queue };
}

describe("HumanHandoffProvider", () => {
  it("classifies explicit human requests and high-risk commitments", () => {
    expect(classifyHandoff("担当者に代わってください")).toBe("customer_requested_human");
    expect(classifyHandoff("電話したいです")).toBe("customer_requested_human");
    expect(classifyHandoff("返金を確定してください")).toBe("high_risk_or_commitment");
    expect(classifyHandoff("取り置きをこの場で確定してください")).toBe("high_risk_or_commitment");
    expect(classifyHandoff("返品条件を教えてください")).toBeUndefined();
  });

  it("stores a handoff, returns configured contact details, and skips the model", async () => {
    const { database, inner, provider } = setup();
    database.prepare(`INSERT INTO conversations (user_id, state, rally_count, created_at, updated_at)
      VALUES ('u1', 'active', 0, '2026-09-12T00:00:00Z', '2026-09-12T00:00:00Z')`).run();
    const result = await provider.answer({ message: "担当者に代わってください", userId: "u1", conversationId: 1 });
    expect(inner.answer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ route: "needs_review", handoff: { reason: "customer_requested_human" } });
    expect(result.text).toContain("000-0000-0000");
    expect(database.prepare("SELECT user_id, conversation_id, reason FROM handoff_requests").get())
      .toEqual({ user_id: "u1", conversation_id: 1, reason: "customer_requested_human" });
    expect(database.prepare("SELECT state FROM conversations WHERE id = 1").get()).toEqual({ state: "human_handoff" });
    database.close();
  });

  it("deduplicates an identical handoff and resolves it", () => {
    const { database, queue } = setup();
    const input = { userId: "u1", message: "返金を確定してください", reason: "high_risk_or_commitment" as const };
    const first = queue.enqueue(input);
    const second = queue.enqueue(input);
    expect(first.queued).toBe(true);
    expect(second).toEqual({ id: first.id, queued: false });
    expect(queue.resolve(first.id, "電話対応済み")).toBe(true);
    expect(queue.list("resolved")).toHaveLength(1);
    database.close();
  });
});
