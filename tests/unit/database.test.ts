import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../../bridge/src/db/database.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite schema", () => {
  it("creates durable event and job tables with duplicate constraints", () => {
    const directory = mkdtempSync(join(tmpdir(), "line-bot-db-"));
    temporaryDirectories.push(directory);
    const database = initializeDatabase(join(directory, "queue.db"));

    database.prepare(`INSERT INTO line_events
      (webhook_event_id, user_id, received_at, payload_json)
      VALUES (?, ?, ?, ?)`)
      .run("event-1", "user-1", new Date(0).toISOString(), "{}");

    expect(() => database.prepare(`INSERT INTO line_events
      (webhook_event_id, user_id, received_at, payload_json)
      VALUES (?, ?, ?, ?)`)
      .run("event-1", "user-1", new Date(0).toISOString(), "{}"))
      .toThrow();

    database.close();
  });
});

