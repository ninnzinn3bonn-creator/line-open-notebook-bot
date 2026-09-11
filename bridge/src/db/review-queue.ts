import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export type ReviewCandidate = {
  userId: string;
  message: string;
  reason: string;
  topScore?: number;
  searchResults: unknown[];
};

export type ReviewDecision = "in_scope" | "out_of_scope" | "knowledge_missing";

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

  list(status: "pending" | "resolved" = "pending", limit = 50): unknown[] {
    return this.database.prepare(`SELECT id, user_id AS userId, message_text AS message, reason,
      top_score AS topScore, search_results_json AS searchResultsJson, decision,
      decision_note AS decisionNote, status, created_at AS createdAt,
      updated_at AS updatedAt, resolved_at AS resolvedAt
      FROM review_requests WHERE status = ? ORDER BY created_at ASC LIMIT ?`)
      .all(status, Math.max(1, Math.min(100, limit)));
  }

  resolve(id: number, decision: ReviewDecision, note?: string): boolean {
    const resolve = this.database.transaction(() => {
      const now = new Date().toISOString();
      const result = this.database.prepare(`UPDATE review_requests
        SET decision = ?, decision_note = ?, status = 'resolved', resolved_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`).run(decision, note?.trim() || null, now, now, id);
      if (result.changes !== 1) return false;
      this.database.prepare(`INSERT INTO review_decision_history
        (review_request_id, decision, decision_note, decided_at) VALUES (?, ?, ?, ?)`)
        .run(id, decision, note?.trim() || null, now);
      return true;
    });
    return resolve.immediate();
  }
}
