import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export function initializeDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new Database(filename);
  const schemaPath = resolve(process.cwd(), "bridge/src/db/schema.sql");
  database.exec(readFileSync(schemaPath, "utf8"));
  return database;
}
