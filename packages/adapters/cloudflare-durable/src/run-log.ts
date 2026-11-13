import type { RunEvent } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  checkRunAppend,
  type RunSnapshot,
} from "@halonicjs/ports";
import type { RunSql, SqlRow } from "./run-sql.ts";

/**
 * Cloudflare keeps a SQLite row to at most 2 MB. A snapshot is a cache the
 * port lets an adapter drop, so one that would not fit is left out. The
 * margin below 2 MB covers the row's other columns.
 */
export const maxSnapshotBytes = 2 * 1024 * 1024 - 4096;

interface EventRow extends SqlRow {
  json: string;
}

interface SnapshotRow extends SqlRow {
  seq: number;
  json: string;
}

/**
 * One run's event log and its latest snapshot, in the SQLite storage of the
 * run's own Durable Object. An append writes its events and its snapshot in
 * one transaction, and checks `expectedSeq` inside it, so of two writers
 * with the same `expectedSeq` exactly one wins.
 *
 * Events are kept as the JSON text they arrive as, so the store always hands
 * out its own copy.
 */
export class RunLog {
  readonly #sql: RunSql;
  readonly #onAppended: (lastSeq: number) => void;

  /**
   * @param sql - the object's storage
   * @param onAppended - called inside an append's transaction, once its events are written, with
   *   the log's new last seq. What it writes is stored with the events or not at all.
   */
  constructor(sql: RunSql, onAppended: (lastSeq: number) => void = () => {}) {
    this.#sql = sql;
    this.#onAppended = onAppended;
    sql.exec("CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, json TEXT NOT NULL)");
    sql.exec(
      "CREATE TABLE IF NOT EXISTS snapshot (only_row INTEGER PRIMARY KEY CHECK (only_row = 1), seq INTEGER NOT NULL, json TEXT NOT NULL)",
    );
  }

  /** Appends the events when the log's last event is `expectedSeq`, as `RunStore.append` says. */
  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): AppendResult {
    checkRunAppend(runId, expectedSeq, events);
    return this.#sql.transactionSync(() => {
      const lastSeq = this.lastSeq();
      if (lastSeq !== expectedSeq) {
        return { ok: false, reason: "conflict", lastSeq };
      }
      for (const event of events) {
        this.#sql.exec(
          "INSERT INTO events (seq, json) VALUES (?, ?)",
          event.seq,
          JSON.stringify(event),
        );
      }
      const newLastSeq = expectedSeq + events.length;
      this.#storeSnapshot(newLastSeq, options.snapshot);
      this.#onAppended(newLastSeq);
      return { ok: true, lastSeq: newLastSeq };
    });
  }

  /** The sequence number of the last stored event, 0 for an empty log. */
  lastSeq(): number {
    const [row] = this.#sql
      .exec<{ last: number }>("SELECT COALESCE(MAX(seq), 0) AS last FROM events")
      .toArray();
    return row?.last ?? 0;
  }

  /** The last stored event, or `null` for an empty log. */
  lastEvent(): RunEvent | null {
    const [row] = this.#sql
      .exec<EventRow>("SELECT json FROM events ORDER BY seq DESC LIMIT 1")
      .toArray();
    return row === undefined ? null : (JSON.parse(row.json) as RunEvent);
  }

  /** The events after `afterSeq`, oldest first. */
  events(afterSeq = 0): RunEvent[] {
    return this.#sql
      .exec<EventRow>("SELECT json FROM events WHERE seq > ? ORDER BY seq", afterSeq)
      .toArray()
      .map((row) => JSON.parse(row.json) as RunEvent);
  }

  /** The latest stored snapshot, or `null` when there is none. */
  snapshot(): RunSnapshot | null {
    const [row] = this.#sql.exec<SnapshotRow>("SELECT seq, json FROM snapshot").toArray();
    return row === undefined ? null : { seq: row.seq, state: JSON.parse(row.json) };
  }

  #storeSnapshot(seq: number, state: unknown): void {
    if (state === undefined) return;
    const json = JSON.stringify(state);
    if (new TextEncoder().encode(json).byteLength > maxSnapshotBytes) return;
    this.#sql.exec(
      "INSERT INTO snapshot (only_row, seq, json) VALUES (1, ?, ?) ON CONFLICT (only_row) DO UPDATE SET seq = excluded.seq, json = excluded.json",
      seq,
      json,
    );
  }
}
