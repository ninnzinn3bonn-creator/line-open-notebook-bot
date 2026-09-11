import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export type ReviewCandidate = {
  userId: string;
  message: string;
  reason: string;
  topScore?: number;
  searchResults: unknown[];
};

export class ReviewQueue {
  constructor(private readonly database: Database.Database) {}

  enqueue(candidate: ReviewCandidate): "queued" | "duplicate" {
    const normalized = candidate.message.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const dedupeKey = createHash("sha256").update(`${candidate.userId}\0${normalized}`).digest("hex");
    const now = new Date().toISOString();
    const result = this.database.prepare(`INSERT OR IGNORE INTO review_requests
      (dedupe_key, user_id, message_text, reason, top_score, search_results_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(dedupeKey, candidate.userId, candidate.message, candidate.reason, candidate.topScore ?? null,
        JSON.stringify(candidate.searchResults), now, now);
    return result.changes === 1 ? "queued" : "duplicate";
  }
}
