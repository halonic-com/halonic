import type { RunSql, SqlRow } from "./run-sql.ts";
import { retryWaitMs } from "./timer-table.ts";

/** What is waiting to reach the run list. */
export interface OutboxEntry {
  /** The last event the run list doesn't have yet (the log's last seq when the entry was last marked). */
  seq: number;
  /** How many tries in a row have failed. */
  failures: number;
  /** When to try next, in ms since 1970. */
  dueAtMs: number;
}

interface OutboxRow extends SqlRow {
  seq: number;
  failures: number;
  due_at_ms: number;
}

/**
 * The note that the run list is behind the log. It is one row, because the list wants only the
 * run's latest summary: a mark replaces the row, and an older mark never matters once a newer one
 * is there. Marking happens in the same transaction as the append, so a log that moved on always
 * has a note, and a crash can't lose it. What is published is worked out from the log when the
 * entry is sent, never kept here.
 */
export class RunOutbox {
  readonly #sql: RunSql;

  constructor(sql: RunSql) {
    this.#sql = sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS outbox (only_row INTEGER PRIMARY KEY CHECK (only_row = 1), seq INTEGER NOT NULL, failures INTEGER NOT NULL, due_at_ms INTEGER NOT NULL)",
    );
  }

  /** Notes that the log is at `seq`, to be sent now: a new mark starts again with no failures. */
  mark(seq: number, nowMs: number): void {
    this.#sql.exec(
      `INSERT INTO outbox (only_row, seq, failures, due_at_ms) VALUES (1, ?, 0, ?)
       ON CONFLICT (only_row) DO UPDATE SET seq = excluded.seq, failures = 0, due_at_ms = excluded.due_at_ms`,
      seq,
      nowMs,
    );
  }

  /** The entry waiting to be sent, or `null`. */
  entry(): OutboxEntry | null {
    const [row] = this.#sql
      .exec<OutboxRow>("SELECT seq, failures, due_at_ms FROM outbox")
      .toArray();
    return row === undefined
      ? null
      : { seq: row.seq, failures: row.failures, dueAtMs: row.due_at_ms };
  }

  /** Removes the entry once `seq` is sent, unless a newer mark replaced it while it was being sent. */
  sent(seq: number): void {
    this.#sql.exec("DELETE FROM outbox WHERE seq = ?", seq);
  }

  /** Keeps the entry for another try after the backoff: 1 second, doubling, at most 15 minutes. */
  failed(entry: OutboxEntry, nowMs: number): void {
    const failures = entry.failures + 1;
    this.#sql.exec(
      "UPDATE outbox SET failures = ?, due_at_ms = ? WHERE seq = ?",
      failures,
      nowMs + retryWaitMs(failures),
      entry.seq,
    );
  }
}
