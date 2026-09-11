import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export function initializeDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new Database(filename);
  const schemaPath = resolve(process.cwd(), "bridge/src/db/schema.sql");
  database.exec(readFileSync(schemaPath, "utf8"));
  addColumnIfMissing(database, "review_requests", "decision_note", "TEXT");
  addColumnIfMissing(database, "review_requests", "resolved_at", "TEXT");
  return database;
}

function addColumnIfMissing(database: Database.Database, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
