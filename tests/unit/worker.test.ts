import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { JobQueue } from "../../bridge/src/db/queue.js";
import { processNextJob, type WorkerOptions } from "../../bridge/src/jobs/worker.js";
import type { LineClient } from "../../bridge/src/line/client.js";
import type { AnswerProvider } from "../../bridge/src/providers/answer-provider.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

const options: WorkerOptions = {
  concurrency: 1,
  pollMs: 1,
  leaseMs: 60_000,
  maxRetries: 0,
  retryDelayMs: 0,
  replyCutoffMs: 45_000,
  emergencyAnswerText: "ただいま回答を取得できません。店舗へお問い合わせください。"
};

describe("worker emergency answer", () => {
  it("sends the configured answer once and preserves the provider error", async () => {
    const directory = mkdtempSync(join(tmpdir(), "line-worker-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const queue = new JobQueue(database);
    queue.enqueue({
      webhookEventId: "evt-fallback",
      userId: "user-1",
      replyToken: "reply-1",
      receivedAt: new Date().toISOString(),
      payloadJson: "{}"
    }, "営業時間は？");

    const provider: AnswerProvider = { answer: vi.fn().mockRejectedValue(new Error("rate limited")) };
    const line: LineClient = { reply: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined) };

    expect(await processNextJob(queue, provider, line, options)).toBe(true);
    expect(line.reply).toHaveBeenCalledOnce();
    expect(line.reply).toHaveBeenCalledWith("reply-1", options.emergencyAnswerText);
    expect(line.push).not.toHaveBeenCalled();
    expect(database.prepare("SELECT state, answer_text, last_error FROM jobs").get()).toEqual({
      state: "succeeded",
      answer_text: options.emergencyAnswerText,
      last_error: "Provider failed; emergency answer used: Error: rate limited"
    });
    database.close();
  });

  it("completes a paused handoff job without sending a LINE message", async () => {
    const directory = mkdtempSync(join(tmpdir(), "line-worker-paused-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const queue = new JobQueue(database);
    queue.enqueue({
      webhookEventId: "evt-paused",
      userId: "user-paused",
      replyToken: "reply-paused",
      receivedAt: new Date().toISOString(),
      payloadJson: "{}"
    }, "追加情報です");
    const provider: AnswerProvider = { answer: vi.fn().mockResolvedValue({ text: "", suppressReply: true, latencyMs: 0 }) };
    const line: LineClient = { reply: vi.fn(), push: vi.fn() };

    expect(await processNextJob(queue, provider, line, options)).toBe(true);
    expect(line.reply).not.toHaveBeenCalled();
    expect(line.push).not.toHaveBeenCalled();
    expect(database.prepare("SELECT state, send_attempts FROM jobs").get()).toEqual({ state: "succeeded", send_attempts: 0 });
    database.close();
  });
});
