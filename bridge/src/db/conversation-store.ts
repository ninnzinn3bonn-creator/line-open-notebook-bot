import type Database from "better-sqlite3";
import type { AnswerResult, ConversationTurn } from "../providers/answer-provider.js";

export type ConversationContext = { conversationId: number; turns: ConversationTurn[] };

export class ConversationStore {
  constructor(private readonly database: Database.Database, private readonly maxRallies = 3) {}

  getOrCreate(userId: string): ConversationContext {
    const operation = this.database.transaction(() => {
      const now = new Date().toISOString();
      let active = this.database.prepare("SELECT id, rally_count FROM conversations WHERE user_id = ? AND state = 'active'")
        .get(userId) as { id: number; rally_count: number } | undefined;
      if (active && active.rally_count >= this.maxRallies) {
        this.database.prepare("UPDATE conversations SET state = 'completed', closed_at = ?, updated_at = ? WHERE id = ?")
          .run(now, now, active.id);
        active = undefined;
      }
      if (!active) {
        const result = this.database.prepare(`INSERT INTO conversations
          (user_id, state, rally_count, created_at, updated_at) VALUES (?, 'active', 0, ?, ?)`)
          .run(userId, now, now);
        active = { id: Number(result.lastInsertRowid), rally_count: 0 };
      }
      const rows = this.database.prepare(`SELECT role, text FROM conversation_turns
        WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`).all(active.id, this.maxRallies * 2) as ConversationTurn[];
      return { conversationId: active.id, turns: rows.reverse() };
    });
    return operation.immediate();
  }

  appendRally(context: ConversationContext, userMessage: string, answer: AnswerResult): void {
    const operation = this.database.transaction(() => {
      const now = new Date().toISOString();
      this.database.prepare(`INSERT INTO conversation_turns (conversation_id, role, text, created_at)
        VALUES (?, 'user', ?, ?)`).run(context.conversationId, userMessage, now);
      this.database.prepare(`INSERT INTO conversation_turns
        (conversation_id, role, text, route, sources_json, model_json, grounding_json, prompt_revision, created_at)
        VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`).run(
          context.conversationId, answer.text, answer.route ?? null,
          answer.sources ? JSON.stringify(answer.sources) : null,
          answer.model ? JSON.stringify(answer.model) : null,
          answer.grounding ? JSON.stringify(answer.grounding) : null,
          answer.promptRevision ?? null, now
        );
      this.database.prepare(`UPDATE conversations SET rally_count = rally_count + 1, updated_at = ? WHERE id = ?`)
        .run(now, context.conversationId);
    });
    operation.immediate();
  }

  reset(userId: string): boolean {
    const now = new Date().toISOString();
    return this.database.prepare(`UPDATE conversations SET state = 'reset', closed_at = ?, updated_at = ?
      WHERE user_id = ? AND state = 'active'`).run(now, now, userId).changes === 1;
  }
}
