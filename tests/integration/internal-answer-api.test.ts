import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../bridge/src/app.js";
import { MockAnswerProvider } from "../../bridge/src/providers/mock-answer-provider.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("internal answer API", () => {
  it("rejects missing and incorrect bearer tokens", async () => {
    const app = createApp({ provider: new MockAnswerProvider(0), internalAdminToken: "admin-secret" });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const url = `http://127.0.0.1:${address.port}/internal/answer`;
    const body = JSON.stringify({ message: "営業時間は？", userId: "eval-user" });

    expect((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(401);
    expect((await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer incorrect" },
      body
    })).status).toBe(401);
    expect((await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer admin-secret" },
      body
    })).status).toBe(200);
  });
});
