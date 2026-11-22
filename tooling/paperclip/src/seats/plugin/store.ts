import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import { retentionDays, type SeatEvent, type SeatReading, type WindowState } from "../records.ts";

/** A seat event and, for one the board recorded, which board user did. */
export interface StoredSeatEvent extends SeatEvent {
  readonly boardUserId: string | undefined;
}

/** What the routes and jobs write to the plugin's own tables. */
export interface SeatsStore {
  recordEvent(event: StoredSeatEvent): Promise<void>;
  recordReading(reading: SeatReading): Promise<void>;
  /** Removes the rows older than `retentionDays` allows, counted back from `now`. */
  removeOld(now: Date): Promise<void>;
}

const dayMs = 24 * 60 * 60_000;

/**
 * The store on Paperclip's database, in the schema it gives the plugin
 * (`ctx.db.namespace`). Paperclip lets the worker write only there.
 */
export function databaseStore(db: PluginDatabaseClient): SeatsStore {
  const schema = db.namespace;
  return {
    async recordEvent(event) {
      await db.execute(
        `INSERT INTO ${schema}.event (seat_id, kind, at, by_kind, board_user_id) VALUES ($1, $2, $3, $4, $5)`,
        [event.seatId, event.kind, event.at, event.by, event.boardUserId ?? null],
      );
    },
    async recordReading(reading) {
      // A reading is stored once; a second one at the same time for the same seat is the same read.
      await db.execute(
        `INSERT INTO ${schema}.reading (seat_id, at, error, session_used_percent, session_resets_at, week_used_percent, week_resets_at, week_by_model) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (seat_id, at) DO NOTHING`,
        [
          reading.seatId,
          reading.at,
          reading.error ?? null,
          ...windowColumns(reading.session),
          ...windowColumns(reading.week),
          JSON.stringify(reading.weekByModel),
        ],
      );
    },
    async removeOld(now) {
      const before = (days: number) => new Date(now.getTime() - days * dayMs).toISOString();
      await db.execute(`DELETE FROM ${schema}.reading WHERE at < $1`, [
        before(retentionDays.readings),
      ]);
      await db.execute(`DELETE FROM ${schema}.event WHERE at < $1`, [before(retentionDays.events)]);
      // A placement counts from its end, so an open one is never removed.
      await db.execute(`DELETE FROM ${schema}.placement WHERE to_at IS NOT NULL AND to_at < $1`, [
        before(retentionDays.placements),
      ]);
      await db.execute(`DELETE FROM ${schema}.agent_usage WHERE bucket_start < $1`, [
        before(retentionDays.agentUsage),
      ]);
      await db.execute(`DELETE FROM ${schema}.agent_activity WHERE at < $1`, [
        before(retentionDays.agentActivity),
      ]);
    },
  };
}

function windowColumns(window: WindowState | undefined): [number | null, string | null] {
  return [window?.usedPercent ?? null, window?.resetsAt ?? null];
}
