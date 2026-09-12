import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export type HandoffReason = "customer_requested_human" | "insufficient_knowledge" | "high_risk_or_commitment" | "repeated_failure" | "technical_failure";

export class HandoffQueue {
  constructor(private readonly database: Database.Database) {}

  enqueue(input: { userId: string; conversationId?: number; message: string; reason: HandoffReason }): { id: number; queued: boolean } {
    const normalized = input.message.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const dedupeKey = createHash("sha256")
      .update(`${input.userId}\0${input.conversationId ?? ""}\0${input.reason}\0${normalized}`).digest("hex");
    const now = new Date().toISOString();
    const operation = this.database.transaction(() => {
      const inserted = this.database.prepare(`INSERT OR IGNORE INTO handoff_requests
        (dedupe_key, user_id, conversation_id, message_text, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
          dedupeKey, input.userId, input.conversationId ?? null, input.message, input.reason, now, now
        );
      const row = this.database.prepare("SELECT id FROM handoff_requests WHERE dedupe_key = ?").get(dedupeKey) as { id: number };
      if (inserted.changes === 1 && input.conversationId) {
        this.database.prepare(`UPDATE conversations SET state = 'human_handoff', closed_at = ?, updated_at = ?
          WHERE id = ? AND state = 'active'`).run(now, now, input.conversationId);
      }
      return { id: row.id, queued: inserted.changes === 1 };
    });
    return operation.immediate();
  }

  list(status: "pending" | "resolved" = "pending", limit = 50): unknown[] {
    return this.database.prepare(`SELECT id, user_id AS userId, conversation_id AS conversationId,
      message_text AS message, reason, status, resolution_note AS resolutionNote,
      created_at AS createdAt, updated_at AS updatedAt, resolved_at AS resolvedAt
      FROM handoff_requests WHERE status = ? ORDER BY created_at ASC LIMIT ?`)
      .all(status, Math.max(1, Math.min(100, limit)));
  }

  resolve(id: number, note?: string): boolean {
    const now = new Date().toISOString();
    return this.database.prepare(`UPDATE handoff_requests SET status = 'resolved', resolution_note = ?,
      resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
      .run(note?.trim() || null, now, now, id).changes === 1;
  }
}
