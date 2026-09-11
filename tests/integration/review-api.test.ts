import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../bridge/src/app.js";
import { initializeDatabase } from "../../bridge/src/db/database.js";
import { ReviewQueue } from "../../bridge/src/db/review-queue.js";
import { MockAnswerProvider } from "../../bridge/src/providers/mock-answer-provider.js";

const directories: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

describe("review API", () => {
  it("requires a bearer token and records an audited decision", async () => {
    const directory = mkdtempSync(join(tmpdir(), "review-api-"));
    directories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));
    const reviewQueue = new ReviewQueue(database);
    reviewQueue.enqueue({ userId: "u1", message: "おすすめは？", reason: "boundary", topScore: 0.65, searchResults: [] });
    const app = createApp({ provider: new MockAnswerProvider(0), reviewQueue, internalAdminToken: "admin-secret" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    expect((await fetch(`${baseUrl}/internal/reviews`)).status).toBe(401);
    const list = await fetch(`${baseUrl}/internal/reviews`, { headers: { authorization: "Bearer admin-secret" } });
    expect(list.status).toBe(200);
    const payload = await list.json() as { reviews: Array<{ id: number }> };
    expect(payload.reviews).toHaveLength(1);

    const resolved = await fetch(`${baseUrl}/internal/reviews/${payload.reviews[0]!.id}/decision`, {
      method: "POST",
      headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
      body: JSON.stringify({ decision: "knowledge_missing", note: "FAQ追加候補" })
    });
    expect(resolved.status).toBe(200);
    expect(database.prepare("SELECT decision, decision_note, status FROM review_requests").get())
      .toEqual({ decision: "knowledge_missing", decision_note: "FAQ追加候補", status: "resolved" });
    expect(database.prepare("SELECT count(*) count FROM review_decision_history").get()).toEqual({ count: 1 });
    database.close();
  });
});
