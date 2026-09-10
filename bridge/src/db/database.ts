import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

export function initializeDatabase(filename: string) {
  const database = new Database(filename);
  const schemaPath = resolve(process.cwd(), "bridge/src/db/schema.sql");
  database.exec(readFileSync(schemaPath, "utf8"));
  return database;
}

