import type { ScheduledTimer } from "@halonicjs/ports";
import { utf8Bytes } from "./input-rules.ts";
import type { RunSql, SqlRow } from "./run-sql.ts";

const maxIdBytes = 256;
const firstRetryWaitMs = 1000;
const maxRetryWaitMs = 15 * 60 * 1000;

/**
 * How long to wait before delivering a timer again after its `failures`-th
 * failure in a row: 1 second, doubling, at most 15 minutes (the `Scheduler`
 * port's backoff).
 */
export function retryWaitMs(failures: number): number {
  return Math.min(firstRetryWaitMs * 2 ** (failures - 1), maxRetryWaitMs);
}

/** A timer as it is stored, with what delivery needs to know about it. */
export interface StoredTimer {
  /** What the timer belongs to, usually a run id. */
  key: string;
  timerId: string;
  /** The ISO time the timer was set for: what the listener is given. */
  at: string;
  /** When to deliver next, in ms since 1970: `at`, or later while a retry waits. */
  dueAtMs: number;
  /** How many deliveries in a row have rejected. */
  failures: number;
  /** Counts the times the timer was set, so a delivery can tell it was set again meanwhile. */
  version: number;
}

interface TimerRow extends SqlRow {
  key: string;
  timer_id: string;
  at: string;
  at_ms: number;
  due_at_ms: number;
  failures: number;
  version: number;
}

interface DueRow extends SqlRow {
  due: number | null;
}

const columns = "key, timer_id, at, at_ms, due_at_ms, failures, version";

/**
 * The timers of the keys (runs) one Durable Object serves, in its SQLite storage. It decides nothing about time: callers pass the clock's `nowMs`.
 *
 * A timer that is set again keeps counting `version` upwards, and a
 * delivery's outcome is applied only to the version it delivered, so a timer
 * set (or cancelled) while its call ran is never undone by that call ending.
 */
export class TimerTable {
  readonly #sql: RunSql;

  constructor(sql: RunSql) {
    this.#sql = sql;
    sql.exec(
      `CREATE TABLE IF NOT EXISTS timers (
        key TEXT NOT NULL, timer_id TEXT NOT NULL, at TEXT NOT NULL, at_ms INTEGER NOT NULL,
        due_at_ms INTEGER NOT NULL, failures INTEGER NOT NULL, version INTEGER NOT NULL,
        PRIMARY KEY (key, timer_id))`,
    );
  }

  /**
   * Sets a timer, or moves the one with this key and id: it is then due at `at`, with no failures.
   *
   * @throws RangeError when the key or id is over 256 UTF-8 bytes or `at` isn't a time
   */
  set(key: string, timerId: string, at: string): void {
    checkIdBytes("key", key);
    checkIdBytes("timer id", timerId);
    const atMs = Date.parse(at);
    if (Number.isNaN(atMs)) {
      throw new RangeError(`A timer's time is an ISO time, not ${JSON.stringify(at)}.`);
    }
    this.#sql.exec(
      `INSERT INTO timers (${columns}) VALUES (?, ?, ?, ?, ?, 0, 1)
       ON CONFLICT (key, timer_id) DO UPDATE SET at = excluded.at, at_ms = excluded.at_ms,
         due_at_ms = excluded.due_at_ms, failures = 0, version = timers.version + 1`,
      key,
      timerId,
      at,
      atMs,
      atMs,
    );
  }

  /** Removes a timer; one that isn't set is not an error. */
  cancel(key: string, timerId: string): void {
    this.#sql.exec("DELETE FROM timers WHERE key = ? AND timer_id = ?", key, timerId);
  }

  /** The timers set for `key`, by the time they were set for, earliest first. */
  pending(key: string): ScheduledTimer[] {
    return this.#sql
      .exec<TimerRow>(`SELECT ${columns} FROM timers WHERE key = ? ORDER BY at_ms, timer_id`, key)
      .toArray()
      .map((row) => ({ key: row.key, timerId: row.timer_id, at: row.at }));
  }

  /** The timers due at `nowMs`, the longest overdue first. */
  due(nowMs: number): StoredTimer[] {
    return this.#sql
      .exec<TimerRow>(
        `SELECT ${columns} FROM timers WHERE due_at_ms <= ? ORDER BY due_at_ms, key, timer_id`,
        nowMs,
      )
      .toArray()
      .map(toStoredTimer);
  }

  /** When the next timer is due, or `null` with no timers. Overdue timers count with their past time. */
  earliestDueMs(): number | null {
    const [row] = this.#sql.exec<DueRow>("SELECT MIN(due_at_ms) AS due FROM timers").toArray();
    return row?.due ?? null;
  }

  /** When the next timer comes due after `nowMs`, or `null` when none does. */
  earliestDueAfter(nowMs: number): number | null {
    const [row] = this.#sql
      .exec<DueRow>("SELECT MIN(due_at_ms) AS due FROM timers WHERE due_at_ms > ?", nowMs)
      .toArray();
    return row?.due ?? null;
  }

  /**
   * Records how a delivery of `timer` ended, unless the timer changed while
   * the call ran. A delivered timer is removed. A rejected one waits its
   * backoff and is due again, and is never dropped.
   */
  finish(timer: StoredTimer, delivered: boolean, nowMs: number): void {
    if (delivered) {
      this.#sql.exec(
        "DELETE FROM timers WHERE key = ? AND timer_id = ? AND version = ?",
        timer.key,
        timer.timerId,
        timer.version,
      );
      return;
    }
    const failures = timer.failures + 1;
    this.#sql.exec(
      "UPDATE timers SET failures = ?, due_at_ms = ? WHERE key = ? AND timer_id = ? AND version = ?",
      failures,
      nowMs + retryWaitMs(failures),
      timer.key,
      timer.timerId,
      timer.version,
    );
  }
}

function checkIdBytes(what: string, id: string): void {
  const bytes = utf8Bytes(id);
  if (bytes > maxIdBytes) {
    throw new RangeError(`A timer's ${what} is at most ${maxIdBytes} UTF-8 bytes, not ${bytes}.`);
  }
}

function toStoredTimer(row: TimerRow): StoredTimer {
  return {
    key: row.key,
    timerId: row.timer_id,
    at: row.at,
    dueAtMs: row.due_at_ms,
    failures: row.failures,
    version: row.version,
  };
}
