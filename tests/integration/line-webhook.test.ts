import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../bridge/src/app.js";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { JobQueue } from "../../bridge/src/db/queue.js";
import { MockAnswerProvider } from "../../bridge/src/providers/mock-answer-provider.js";

const directories: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

describe("LINE webhook", () => {
  it("verifies the raw body and persists a text event before returning 200", async () => {
    const directory = mkdtempSync(join(tmpdir(), "line-webhook-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const app = createApp({ provider: new MockAnswerProvider(0), queue: new JobQueue(database), lineChannelSecret: "secret" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");

    const body = JSON.stringify({ events: [{
      type: "message", webhookEventId: "evt-1", replyToken: "reply-1", timestamp: Date.now(),
      source: { type: "user", userId: "user-1" }, message: { type: "text", text: "営業時間は？" }
    }] });
    const signature = createHmac("sha256", "secret").update(body).digest("base64");
    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/line`, {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature }, body
    });

    expect(response.status).toBe(200);
    const replay = await fetch(`http://127.0.0.1:${address.port}/webhooks/line`, {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature }, body
    });
    expect(replay.status).toBe(200);
    expect(database.prepare("SELECT webhook_event_id, user_id, message_text FROM jobs").get())
      .toEqual({ webhook_event_id: "evt-1", user_id: "user-1", message_text: "営業時間は？" });
    expect(database.prepare("SELECT count(*) count FROM jobs").get()).toEqual({ count: 1 });
    database.close();
  });

  it("rejects an invalid signature without persisting the body", async () => {
    const directory = mkdtempSync(join(tmpdir(), "line-webhook-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const app = createApp({ provider: new MockAnswerProvider(0), queue: new JobQueue(database), lineChannelSecret: "secret" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/line`, {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": "invalid" }, body: "{\"events\":[]}" 
    });
    expect(response.status).toBe(401);
    expect(database.prepare("SELECT count(*) count FROM jobs").get()).toEqual({ count: 0 });
    database.close();
  });
});
