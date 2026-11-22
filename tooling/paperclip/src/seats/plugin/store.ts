import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { SeatEvent } from "../records.ts";

/** A seat event and, for one the board recorded, which board user did. */
export interface StoredSeatEvent extends SeatEvent {
  readonly boardUserId: string | undefined;
}

/** What the routes and jobs write to the plugin's own tables. */
export interface SeatsStore {
  recordEvent(event: StoredSeatEvent): Promise<void>;
}

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
  };
}
