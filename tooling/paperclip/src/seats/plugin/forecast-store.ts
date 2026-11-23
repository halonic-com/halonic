import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { Calibration } from "../forecast/calibrate.ts";
import type { WindowKey } from "../forecast/types.ts";
import type { AgentUsage } from "../records.ts";
import { isoTime } from "./paperclip-tables.ts";

/** What the forecast jobs read from and write to the plugin's own tables. */
export interface ForecastStore {
  /** The usage buckets that start at or after `since`, oldest first. */
  usageSince(since: string): Promise<AgentUsage[]>;
  /** The fits made on `day` ("2026-11-22") or later. */
  calibrationsSince(day: string): Promise<Calibration[]>;
  /** Stores each fit, replacing one made earlier the same day for the same plan, model and window. */
  saveCalibrations(calibrations: readonly Calibration[]): Promise<void>;
  /** Removes the fits made before `day`. */
  removeCalibrationsBefore(day: string): Promise<void>;
}

/** The forecast store in the schema Paperclip gives the plugin (`ctx.db.namespace`). */
export function databaseForecastStore(db: PluginDatabaseClient): ForecastStore {
  const schema = db.namespace;
  return {
    async usageSince(since) {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT agent_id, seat_id, model, bucket_start, input_tokens, cached_input_tokens, output_tokens, runs FROM ${schema}.agent_usage WHERE bucket_start >= $1 ORDER BY bucket_start`,
        [since],
      );
      return rows.map(storedUsage);
    },
    async calibrationsSince(day) {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT day::text AS day, plan, model, window_key, from_at, to_at, input_points_per_million, cached_points_per_million, output_points_per_million, steps, median_error_points, p90_error_points, week_shift, shifted FROM ${schema}.calibration WHERE day >= $1 ORDER BY day`,
        [day],
      );
      return rows.map(storedCalibration);
    },
    async saveCalibrations(calibrations) {
      for (const fit of calibrations) {
        await db.execute(calibrationSql(schema), [
          fit.day,
          fit.plan,
          fit.model,
          fit.window,
          fit.from,
          fit.to,
          fit.pointsPerMillion.input,
          fit.pointsPerMillion.cached,
          fit.pointsPerMillion.output,
          fit.quality.steps,
          fit.quality.medianErrorPoints,
          fit.quality.p90ErrorPoints,
          fit.weekShift ?? null,
          fit.shifted,
        ]);
      }
    },
    async removeCalibrationsBefore(day) {
      await db.execute(`DELETE FROM ${schema}.calibration WHERE day < $1`, [day]);
    },
  };
}

/** Stores one fit; a second run on the same day replaces it. */
function calibrationSql(schema: string): string {
  return `INSERT INTO ${schema}.calibration (day, plan, model, window_key, from_at, to_at, input_points_per_million, cached_points_per_million, output_points_per_million, steps, median_error_points, p90_error_points, week_shift, shifted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (day, plan, model, window_key) DO UPDATE SET from_at = EXCLUDED.from_at, to_at = EXCLUDED.to_at, input_points_per_million = EXCLUDED.input_points_per_million, cached_points_per_million = EXCLUDED.cached_points_per_million, output_points_per_million = EXCLUDED.output_points_per_million, steps = EXCLUDED.steps, median_error_points = EXCLUDED.median_error_points, p90_error_points = EXCLUDED.p90_error_points, week_shift = EXCLUDED.week_shift, shifted = EXCLUDED.shifted`;
}

/** Postgres hands `bigint` columns over as text, so every count goes through `Number`. */
function storedUsage(row: Record<string, unknown>): AgentUsage {
  const seatId = row["seat_id"];
  return {
    agentId: String(row["agent_id"]),
    seatId: seatId === null || seatId === undefined ? undefined : String(seatId),
    model: String(row["model"]),
    bucketStart: isoTime(row["bucket_start"]),
    inputTokens: Number(row["input_tokens"]),
    cachedInputTokens: Number(row["cached_input_tokens"]),
    outputTokens: Number(row["output_tokens"]),
    runs: Number(row["runs"]),
  };
}

function storedCalibration(row: Record<string, unknown>): Calibration {
  const weekShift = row["week_shift"];
  return {
    day: String(row["day"]),
    plan: String(row["plan"]),
    model: String(row["model"]),
    window: String(row["window_key"]) as WindowKey,
    from: isoTime(row["from_at"]),
    to: isoTime(row["to_at"]),
    pointsPerMillion: {
      input: Number(row["input_points_per_million"]),
      cached: Number(row["cached_points_per_million"]),
      output: Number(row["output_points_per_million"]),
    },
    quality: {
      steps: Number(row["steps"]),
      medianErrorPoints: Number(row["median_error_points"]),
      p90ErrorPoints: Number(row["p90_error_points"]),
    },
    weekShift: weekShift === null || weekShift === undefined ? undefined : Number(weekShift),
    shifted: row["shifted"] === true,
  };
}
