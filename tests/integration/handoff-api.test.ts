import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createApp } from "../../bridge/src/app.js";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { HandoffQueue } from "../../bridge/src/db/handoff-queue.js";
import { MockAnswerProvider } from "../../bridge/src/providers/mock-answer-provider.js";

const directories: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

describe("handoff API", () => {
  it("requires admin authentication and resolves a pending handoff", async () => {
    const directory = mkdtempSync(join(tmpdir(), "handoff-api-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const handoffQueue = new HandoffQueue(database);
    const record = handoffQueue.enqueue({ userId: "u1", message: "担当者に代わって", reason: "customer_requested_human" });
    const app = createApp({ provider: new MockAnswerProvider(0), handoffQueue, internalAdminToken: "admin-secret" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    expect((await fetch(`${baseUrl}/internal/handoffs`)).status).toBe(401);
    const pending = await fetch(`${baseUrl}/internal/handoffs`, { headers: { authorization: "Bearer admin-secret" } });
    expect((await pending.json()).handoffs).toHaveLength(1);
    const resolved = await fetch(`${baseUrl}/internal/handoffs/${record.id}/resolve`, {
      method: "POST",
      headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
      body: JSON.stringify({ note: "電話対応済み" })
    });
    expect(resolved.status).toBe(200);
    expect(handoffQueue.list("resolved")).toHaveLength(1);
    database.close();
  });
});
