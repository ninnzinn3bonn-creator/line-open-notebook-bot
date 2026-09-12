import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { JobQueue } from "../../bridge/src/db/queue.js";
import { processNextJob, type WorkerOptions } from "../../bridge/src/jobs/worker.js";
import type { LineClient } from "../../bridge/src/line/client.js";
import type { AnswerProvider } from "../../bridge/src/providers/answer-provider.js";
import { TimeoutAnswerProvider } from "../../bridge/src/providers/timeout-answer-provider.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

const options: WorkerOptions = {
  concurrency: 3,
  pollMs: 1,
  leaseMs: 60_000,
  maxRetries: 1,
  retryDelayMs: 0,
  replyCutoffMs: 45_000,
  emergencyAnswerText: "ただいま回答を取得できません。店舗へお問い合わせください。"
};

function setup(name: string) {
  const directory = mkdtempSync(join(tmpdir(), name));
  directories.push(directory);
  const filename = join(directory, "queue.db");
  const database = initializeDatabase(filename);
  return { database, filename, queue: new JobQueue(database) };
}

function enqueue(queue: JobQueue, id: number, userId: string) {
  queue.enqueue({
    webhookEventId: `evt-${id}`,
    userId,
    replyToken: `reply-${id}`,
    receivedAt: new Date().toISOString(),
    payloadJson: "{}"
  }, `message-${id}`);
}

describe("Bridge resilience scenarios", () => {
  it("processes a 10-event burst with three users concurrently", async () => {
    const { database, queue } = setup("burst-");
    for (let index = 1; index <= 10; index += 1) enqueue(queue, index, `user-${index % 3}`);
    let active = 0;
    let maxActive = 0;
    const provider: AnswerProvider = { answer: vi.fn(async ({ message }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { text: `answer:${message}`, latencyMs: 5 };
    }) };
    const line: LineClient = { reply: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined) };

    for (let wave = 0; wave < 10; wave += 1) {
      const processed = await Promise.all(Array.from({ length: 3 }, () => processNextJob(queue, provider, line, options)));
      if (!processed.some(Boolean)) break;
    }

    expect(maxActive).toBe(3);
    expect(database.prepare("SELECT count(*) count FROM jobs WHERE state = 'succeeded'").get()).toEqual({ count: 10 });
    expect(line.reply).toHaveBeenCalledTimes(10);
    database.close();
  });

  it("preserves order for three messages from the same user", async () => {
    const { database, queue } = setup("ordered-");
    for (let index = 1; index <= 3; index += 1) enqueue(queue, index, "same-user");
    const seen: string[] = [];
    const provider: AnswerProvider = { answer: vi.fn(async ({ message }) => {
      seen.push(message);
      return { text: `answer:${message}`, latencyMs: 0 };
    }) };
    const line: LineClient = { reply: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined) };

    for (let index = 0; index < 3; index += 1) {
      const attempts = await Promise.all(Array.from({ length: 3 }, () => processNextJob(queue, provider, line, options)));
      expect(attempts.filter(Boolean)).toHaveLength(1);
    }

    expect(seen).toEqual(["message-1", "message-2", "message-3"]);
    database.close();
  });

  it("recovers a processing job after reopening the database", async () => {
    const { database, filename, queue } = setup("restart-");
    enqueue(queue, 1, "restart-user");
    const beforeRestart = new Date();
    expect(queue.claimNext(1, beforeRestart)?.message).toBe("message-1");
    database.close();

    const reopened = initializeDatabase(filename);
    const recoveredQueue = new JobQueue(reopened);
    expect(recoveredQueue.recoverExpiredLeases(new Date(beforeRestart.getTime() + 2))).toBe(1);
    const provider: AnswerProvider = { answer: vi.fn(async () => ({ text: "recovered", latencyMs: 0 })) };
    const line: LineClient = { reply: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined) };
    expect(await processNextJob(recoveredQueue, provider, line, options)).toBe(true);
    expect(reopened.prepare("SELECT state, answer_text FROM jobs").get()).toEqual({ state: "succeeded", answer_text: "recovered" });
    reopened.close();
  });

  it("retries a timed-out provider then sends one emergency answer", async () => {
    const { database, queue } = setup("timeout-");
    enqueue(queue, 1, "timeout-user");
    const provider = new TimeoutAnswerProvider({ answer: vi.fn(() => new Promise<never>(() => undefined)) }, 5);
    const line: LineClient = { reply: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined) };

    expect(await processNextJob(queue, provider, line, options)).toBe(true);
    expect(line.reply).not.toHaveBeenCalled();
    expect(await processNextJob(queue, provider, line, options)).toBe(true);
    expect(line.reply).toHaveBeenCalledOnce();
    expect(line.reply).toHaveBeenCalledWith("reply-1", options.emergencyAnswerText);
    expect(database.prepare("SELECT state, attempts, last_error FROM jobs").get()).toMatchObject({
      state: "succeeded",
      attempts: 2,
      last_error: "Provider failed; emergency answer used: Error: Answer provider timed out after 5ms"
    });
    database.close();
  });
});
