import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type QueuedLineEvent = {
  webhookEventId: string;
  userId: string;
  replyToken?: string;
  receivedAt: string;
  payloadJson: string;
};

export type ClaimedJob = {
  id: number;
  webhookEventId: string;
  userId: string;
  replyToken: string | null;
  receivedAt: string;
  message: string;
  attempts: number;
  answerText: string | null;
  pushRetryKey: string | null;
};

export class JobQueue {
  constructor(private readonly database: Database.Database) {}

  enqueue(event: QueuedLineEvent, message: string): "queued" | "duplicate" {
    const insert = this.database.transaction(() => {
      const eventResult = this.database.prepare(`INSERT OR IGNORE INTO line_events
        (webhook_event_id, user_id, reply_token, received_at, payload_json)
        VALUES (?, ?, ?, ?, ?)`)
        .run(event.webhookEventId, event.userId, event.replyToken ?? null, event.receivedAt, event.payloadJson);
      if (eventResult.changes === 0) return "duplicate" as const;

      const now = new Date().toISOString();
      this.database.prepare(`INSERT INTO jobs
        (webhook_event_id, user_id, message_text, state, available_at, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, ?, ?)`)
        .run(event.webhookEventId, event.userId, message, now, now, now);
      return "queued" as const;
    });
    return insert.immediate();
  }

  recoverExpiredLeases(now = new Date()): number {
    const iso = now.toISOString();
    const processing = this.database.prepare(`UPDATE jobs
      SET state = 'pending', lease_until = NULL, available_at = ?, updated_at = ?
      WHERE state = 'processing' AND lease_until IS NOT NULL AND lease_until < ?`)
      .run(iso, iso, iso).changes;
    const push = this.database.prepare(`UPDATE jobs
      SET state = 'pending', lease_until = NULL, available_at = ?, updated_at = ?, last_error = 'Recovered interrupted push send'
      WHERE state = 'sending' AND send_mode = 'push' AND lease_until IS NOT NULL AND lease_until < ?`)
      .run(iso, iso, iso).changes;
    const reply = this.database.prepare(`UPDATE jobs
      SET state = 'unknown', lease_until = NULL, updated_at = ?, last_error = 'Reply outcome unknown after process interruption'
      WHERE state = 'sending' AND send_mode = 'reply' AND lease_until IS NOT NULL AND lease_until < ?`)
      .run(iso, iso).changes;
    return processing + push + reply;
  }

  claimNext(leaseMs: number, now = new Date()): ClaimedJob | undefined {
    const claim = this.database.transaction(() => {
      this.recoverExpiredLeases(now);
      const iso = now.toISOString();
      const row = this.database.prepare(`SELECT
          j.id, j.webhook_event_id, j.user_id, j.attempts, j.answer_text,
          j.push_retry_key, j.message_text, e.reply_token, e.received_at
        FROM jobs j
        JOIN line_events e ON e.webhook_event_id = j.webhook_event_id
        WHERE j.state = 'pending' AND j.available_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM jobs earlier
            WHERE earlier.user_id = j.user_id AND earlier.id < j.id
              AND earlier.state NOT IN ('succeeded', 'failed', 'unknown')
          )
        ORDER BY j.id
        LIMIT 1`).get(iso) as Record<string, unknown> | undefined;
      if (!row) return undefined;

      const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
      const updated = this.database.prepare(`UPDATE jobs
        SET state = 'processing', attempts = attempts + 1, lease_until = ?, updated_at = ?
        WHERE id = ? AND state = 'pending'`).run(leaseUntil, iso, row.id);
      if (updated.changes !== 1) return undefined;

      return {
        id: Number(row.id),
        webhookEventId: String(row.webhook_event_id),
        userId: String(row.user_id),
        replyToken: row.reply_token == null ? null : String(row.reply_token),
        receivedAt: String(row.received_at),
        message: String(row.message_text),
        attempts: Number(row.attempts) + 1,
        answerText: row.answer_text == null ? null : String(row.answer_text),
        pushRetryKey: row.push_retry_key == null ? null : String(row.push_retry_key)
      } satisfies ClaimedJob;
    });
    return claim.immediate();
  }

  saveAnswer(jobId: number, text: string): void {
    const now = new Date().toISOString();
    this.database.prepare(`UPDATE jobs SET answer_text = ?, updated_at = ? WHERE id = ?`)
      .run(text, now, jobId);
  }

  beginSend(jobId: number, mode: "reply" | "push"): string | undefined {
    const begin = this.database.transaction(() => {
      const row = this.database.prepare("SELECT push_retry_key FROM jobs WHERE id = ? AND state = 'processing'")
        .get(jobId) as { push_retry_key: string | null } | undefined;
      if (!row) return undefined;
      const retryKey = mode === "push" ? row.push_retry_key ?? randomUUID() : row.push_retry_key;
      const now = new Date().toISOString();
      this.database.prepare(`UPDATE jobs
        SET state = 'sending', send_mode = ?, push_retry_key = ?, send_attempts = send_attempts + 1,
            updated_at = ? WHERE id = ?`)
        .run(mode, retryKey, now, jobId);
      return retryKey ?? undefined;
    });
    return begin.immediate();
  }

  markSucceeded(jobId: number): void {
    const now = new Date().toISOString();
    this.database.prepare(`UPDATE jobs SET state = 'succeeded', sent_at = ?, updated_at = ?, last_error = NULL
      WHERE id = ?`).run(now, now, jobId);
  }

  markUnknown(jobId: number, error: string): void {
    const now = new Date().toISOString();
    this.database.prepare(`UPDATE jobs SET state = 'unknown', updated_at = ?, last_error = ? WHERE id = ?`)
      .run(now, error, jobId);
  }

  retryOrFail(jobId: number, attempts: number, maxRetries: number, error: string, delayMs: number): void {
    const now = new Date();
    const shouldRetry = attempts <= maxRetries;
    this.database.prepare(`UPDATE jobs
      SET state = ?, available_at = ?, lease_until = NULL, updated_at = ?, last_error = ?
      WHERE id = ?`).run(
        shouldRetry ? "pending" : "failed",
        new Date(now.getTime() + delayMs).toISOString(),
        now.toISOString(),
        error,
        jobId
      );
  }
}
