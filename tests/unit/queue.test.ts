import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { JobQueue } from "../../bridge/src/db/queue.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "line-queue-"));
  directories.push(directory);
  const database = initializeDatabase(join(directory, "queue.db"));
  return { database, queue: new JobQueue(database) };
}

describe("persistent queue", () => {
  it("enqueues an event atomically and rejects redelivery", () => {
    const { database, queue } = setup();
    const event = { webhookEventId: "evt-1", userId: "u-1", replyToken: "r", receivedAt: new Date(0).toISOString(), payloadJson: "{}" };
    expect(queue.enqueue(event, "hello")).toBe("queued");
    expect(queue.enqueue(event, "hello")).toBe("duplicate");
    expect(database.prepare("SELECT count(*) count FROM jobs").get()).toEqual({ count: 1 });
    database.close();
  });

  it("does not let a later job overtake the same user's active job", () => {
    const { database, queue } = setup();
    for (const id of ["1", "2"]) queue.enqueue({ webhookEventId: id, userId: "u", receivedAt: new Date().toISOString(), payloadJson: "{}" }, id);
    const first = queue.claimNext(60_000)!;
    expect(first.message).toBe("1");
    expect(queue.claimNext(60_000)).toBeUndefined();
    queue.markSucceeded(first.id);
    expect(queue.claimNext(60_000)?.message).toBe("2");
    database.close();
  });

  it("recovers an interrupted push with its retry key", () => {
    const { database, queue } = setup();
    queue.enqueue({ webhookEventId: "1", userId: "u", receivedAt: new Date().toISOString(), payloadJson: "{}" }, "question");
    const startedAt = new Date();
    const job = queue.claimNext(1, startedAt)!;
    queue.saveAnswer(job.id, "answer");
    const retryKey = queue.beginSend(job.id, "push");
    const afterLease = new Date(startedAt.getTime() + 2);
    queue.recoverExpiredLeases(afterLease);
    const recovered = queue.claimNext(60_000, afterLease);
    expect(recovered?.answerText).toBe("answer");
    expect(recovered?.pushRetryKey).toBe(retryKey);
    database.close();
  });
});
