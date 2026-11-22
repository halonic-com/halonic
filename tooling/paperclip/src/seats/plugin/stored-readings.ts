import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { ReadError, SeatId, SeatReading, WindowState } from "../records.ts";
import { isoTime } from "./paperclip-tables.ts";

/** A seat's newest stored reading and, when that one failed, its newest good one. */
export interface StoredSeatReadings {
  readonly seatId: SeatId;
  readonly latest: SeatReading;
  /** The newest reading without an error; the same as `latest` when that one is good. */
  readonly lastGood: SeatReading | undefined;
}

/** Reads what `seats.read` stored. It never reads a seat itself. */
export interface StoredReadings {
  /** Each seat's newest readings, for every seat the table has. */
  latest(): Promise<StoredSeatReadings[]>;
}

const readErrors: readonly ReadError[] = ["timeout", "rate-limited", "signed-out", "unreadable"];

/** The plugin's own `reading` table; Paperclip gives the plugin that schema only. */
export function databaseStoredReadings(db: PluginDatabaseClient): StoredReadings {
  const newest = (onlyGood: boolean) =>
    `SELECT DISTINCT ON (seat_id) seat_id, at, error, session_used_percent, session_resets_at, week_used_percent, week_resets_at, week_by_model FROM ${db.namespace}.reading${onlyGood ? " WHERE error IS NULL" : ""} ORDER BY seat_id, at DESC`;
  return {
    async latest() {
      const latestRows = await db.query<Record<string, unknown>>(newest(false));
      const goodRows = await db.query<Record<string, unknown>>(newest(true));
      const good = new Map(goodRows.map((row) => [String(row["seat_id"]), storedReading(row)]));
      return latestRows.map((row) => {
        const latest = storedReading(row);
        return { seatId: latest.seatId, latest, lastGood: good.get(latest.seatId) };
      });
    },
  };
}

function storedReading(row: Record<string, unknown>): SeatReading {
  const error = row["error"];
  return {
    seatId: String(row["seat_id"]),
    at: isoTime(row["at"]),
    error:
      error === null || error === undefined
        ? undefined
        : (readErrors.find((known) => known === error) ?? "unreadable"),
    session: windowState(row["session_used_percent"], row["session_resets_at"]),
    week: windowState(row["week_used_percent"], row["week_resets_at"]),
    weekByModel: weekByModel(row["week_by_model"]),
  };
}

function windowState(usedPercent: unknown, resetsAt: unknown): WindowState | undefined {
  if (usedPercent === null || usedPercent === undefined || !Number.isFinite(Number(usedPercent))) {
    return undefined;
  }
  return {
    usedPercent: Number(usedPercent),
    resetsAt: resetsAt === null || resetsAt === undefined ? undefined : isoTime(resetsAt),
  };
}

/** The `week_by_model` column, read defensively: an entry without a percent is left out. */
function weekByModel(value: unknown): Record<string, WindowState> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  const windows: Record<string, WindowState> = {};
  if (typeof parsed !== "object" || parsed === null) {
    return windows;
  }
  for (const [model, entry] of Object.entries(parsed)) {
    const { usedPercent, resetsAt } = (entry ?? {}) as Record<string, unknown>;
    const window = windowState(usedPercent, resetsAt);
    if (window !== undefined) {
      windows[model] = window;
    }
  }
  return windows;
}
