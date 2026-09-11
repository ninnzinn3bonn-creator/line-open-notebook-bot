PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS line_events (
  webhook_event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reply_token TEXT,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_event_id TEXT NOT NULL UNIQUE REFERENCES line_events(webhook_event_id),
  user_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','processing','generated','sending','succeeded','failed','unknown')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  answer_text TEXT,
  push_retry_key TEXT,
  send_mode TEXT CHECK (send_mode IS NULL OR send_mode IN ('reply','push')),
  send_attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(state, available_at, lease_until, id);
CREATE INDEX IF NOT EXISTS jobs_user_order_idx ON jobs(user_id, id);

CREATE TABLE IF NOT EXISTS review_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  reason TEXT NOT NULL,
  top_score REAL,
  search_results_json TEXT NOT NULL,
  decision TEXT CHECK (decision IS NULL OR decision IN ('in_scope','out_of_scope','knowledge_missing')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS review_requests_status_idx ON review_requests(status, created_at);
