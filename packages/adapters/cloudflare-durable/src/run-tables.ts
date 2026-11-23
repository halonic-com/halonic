import type { RunSql } from "./run-sql.ts";

/** Every table of a run object. They are created together, so one being there means all are. */
const createStatements = [
  "CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, json TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS snapshot (only_row INTEGER PRIMARY KEY CHECK (only_row = 1), seq INTEGER NOT NULL, json TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS outbox (only_row INTEGER PRIMARY KEY CHECK (only_row = 1), seq INTEGER NOT NULL, failures INTEGER NOT NULL, due_at_ms INTEGER NOT NULL)",
  `CREATE TABLE IF NOT EXISTS timers (
    key TEXT NOT NULL, timer_id TEXT NOT NULL, at TEXT NOT NULL, at_ms INTEGER NOT NULL,
    due_at_ms INTEGER NOT NULL, failures INTEGER NOT NULL, version INTEGER NOT NULL,
    PRIMARY KEY (key, timer_id))`,
  "CREATE TABLE IF NOT EXISTS name_prefix (only_row INTEGER PRIMARY KEY CHECK (only_row = 1), prefix TEXT NOT NULL)",
];

/**
 * Creates the run object's tables. Only a write calls it: a read of a run that was never written,
 * a foreign or a made-up id included, must leave no storage behind.
 */
export function createRunTables(sql: RunSql): void {
  for (const statement of createStatements) {
    sql.exec(statement);
  }
}

/**
 * Whether the run object has its tables, that is, whether anything was ever written to it. It reads
 * the schema only, which writes nothing. It looks for `events`, which every run object written
 * before `name_prefix` existed has too; {@link createRunTables} adds the newer tables to those.
 */
export function hasRunTables(sql: RunSql): boolean {
  const rows = sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'",
    )
    .toArray();
  return rows.length > 0;
}

/**
 * Notes the name prefix the object was written under, on its first write, and checks it on every
 * later one, so one object never holds the writes of two scopes. Its tables must exist.
 *
 * @throws RangeError when the object was first written under another prefix; the message names neither
 */
export function recordNamePrefix(sql: RunSql, prefix: string): void {
  const stored = storedNamePrefix(sql);
  if (stored === null) {
    sql.exec("INSERT INTO name_prefix (only_row, prefix) VALUES (1, ?)", prefix);
  } else if (stored !== prefix) {
    throw new RangeError("This run object was written under another name prefix.");
  }
}

/**
 * The name prefix the object was first written under, or `null` before its first write since
 * prefixes were noted. Its tables must exist.
 */
export function storedNamePrefix(sql: RunSql): string | null {
  const [row] = sql.exec<{ prefix: string }>("SELECT prefix FROM name_prefix").toArray();
  return row?.prefix ?? null;
}
