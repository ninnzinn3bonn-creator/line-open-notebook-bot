import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { ConversationStore } from "../../bridge/src/db/conversation-store.js";
import { ConversationMemoryProvider, buildContextualSearchMessage } from "../../bridge/src/providers/conversation-memory-provider.js";
import type { AnswerInput, AnswerProvider } from "../../bridge/src/providers/answer-provider.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function setup(maxRallies = 3) {
  const directory = mkdtempSync(join(tmpdir(), "conversation-"));
  directories.push(directory);
  const database = initializeDatabase(join(directory, "queue.db"));
  const inner: AnswerProvider = { answer: vi.fn(async (input: AnswerInput) => ({ text: `回答:${input.message}`, latencyMs: 1, route: "in_scope" as const })) };
  return { database, inner, provider: new ConversationMemoryProvider(inner, new ConversationStore(database, maxRallies)) };
}

describe("ConversationMemoryProvider", () => {
  it("adds the previous question only for context-dependent follow-ups", async () => {
    const { database, inner, provider } = setup();
    await provider.answer({ message: "営業時間は何時までですか？", userId: "u1" });
    await provider.answer({ message: "土曜日も同じですか？", userId: "u1" });
    expect(vi.mocked(inner.answer).mock.calls[1]![0].searchMessage)
      .toBe("営業時間は何時までですか？\n続きの質問: 土曜日も同じですか？");
    expect(database.prepare("SELECT rally_count FROM conversations WHERE state = 'active'").get()).toEqual({ rally_count: 2 });
    database.close();
  });

  it("does not mix another user's history or independent new questions", async () => {
    const { database, inner, provider } = setup();
    await provider.answer({ message: "営業時間は？", userId: "u1" });
    await provider.answer({ message: "送料はいくらですか？", userId: "u2" });
    expect(vi.mocked(inner.answer).mock.calls[1]![0].searchMessage).toBe("送料はいくらですか？");
    expect(database.prepare("SELECT count(*) count FROM conversations").get()).toEqual({ count: 2 });
    database.close();
  });

  it("starts a new conversation after three rallies", async () => {
    const { database, inner, provider } = setup(3);
    for (const message of ["質問1", "質問2", "質問3", "それは？"]) await provider.answer({ message, userId: "u1" });
    expect(vi.mocked(inner.answer).mock.calls[3]![0].searchMessage).toBe("それは？");
    expect(database.prepare("SELECT state, rally_count FROM conversations ORDER BY id").all())
      .toEqual([{ state: "completed", rally_count: 3 }, { state: "active", rally_count: 1 }]);
    database.close();
  });

  it("resets conversation context deterministically", async () => {
    const { database, inner, provider } = setup();
    await provider.answer({ message: "営業時間は？", userId: "u1" });
    const reset = await provider.answer({ message: "会話をリセットしてください", userId: "u1" });
    await provider.answer({ message: "それは？", userId: "u1" });
    expect(reset.route).toBe("deterministic");
    expect(vi.mocked(inner.answer).mock.calls[1]![0].searchMessage).toBe("それは？");
    database.close();
  });

  it("does not store a suppressed human-handoff message as a bot rally", async () => {
    const directory = mkdtempSync(join(tmpdir(), "conversation-paused-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const inner: AnswerProvider = { answer: vi.fn(async () => ({ text: "", suppressReply: true, latencyMs: 0 })) };
    const provider = new ConversationMemoryProvider(inner, new ConversationStore(database, 3));
    await provider.answer({ message: "追加情報です", userId: "u1" });
    expect(database.prepare("SELECT rally_count FROM conversations WHERE user_id = 'u1'").get()).toEqual({ rally_count: 0 });
    expect(database.prepare("SELECT count(*) count FROM conversation_turns").get()).toEqual({ count: 0 });
    database.close();
  });
});

describe("buildContextualSearchMessage", () => {
  it("leaves a standalone question unchanged", () => {
    expect(buildContextualSearchMessage("住所はどこですか？", [{ role: "user", text: "営業時間は？" }]))
      .toBe("住所はどこですか？");
  });
});
