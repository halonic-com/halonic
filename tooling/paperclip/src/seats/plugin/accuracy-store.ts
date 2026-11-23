import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { AccuracyScore, HorizonMinutes, StoredForecastPoint } from "../forecast/accuracy.ts";
import type { WindowKey } from "../forecast/types.ts";
import { isoTime } from "./paperclip-tables.ts";

/** What `seats.accuracy` reads from and writes to the plugin's own tables. */
export interface AccuracyStore {
  /** The forecast points whose target time is at or after `from` and before `to`. */
  forecastPointsTargeting(from: string, to: string): Promise<StoredForecastPoint[]>;
  /** The scores of `day` ("2026-11-22") and later, oldest first. */
  accuracyScoresSince(day: string): Promise<AccuracyScore[]>;
  /** Stores each score, replacing one stored earlier for the same day, window and horizon. */
  saveAccuracyScores(scores: readonly AccuracyScore[]): Promise<void>;
  /** Removes the scores of the days before `day`. */
  removeAccuracyScoresBefore(day: string): Promise<void>;
}

/** The accuracy store in the schema Paperclip gives the plugin (`ctx.db.namespace`). */
export function databaseAccuracyStore(db: PluginDatabaseClient): AccuracyStore {
  const schema = db.namespace;
  return {
    async forecastPointsTargeting(from, to) {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT made_at, seat_id, window_key, horizon_minutes, target_at, p50, p90 FROM ${schema}.forecast_point WHERE target_at >= $1 AND target_at < $2`,
        [from, to],
      );
      return rows.map(storedPoint);
    },
    async accuracyScoresSince(day) {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT day::text AS day, window_key, horizon_minutes, samples, median_error_points, p90_error_points, inside_band FROM ${schema}.accuracy_score WHERE day >= $1 ORDER BY day`,
        [day],
      );
      return rows.map(storedScore);
    },
    async saveAccuracyScores(scores) {
      for (const score of scores) {
        await db.execute(accuracyScoreSql(schema), accuracyScoreRow(score));
      }
    },
    async removeAccuracyScoresBefore(day) {
      await db.execute(`DELETE FROM ${schema}.accuracy_score WHERE day < $1`, [day]);
    },
  };
}

/** Stores one score; a second run for the same day replaces it. */
function accuracyScoreSql(schema: string): string {
  return `INSERT INTO ${schema}.accuracy_score (day, window_key, horizon_minutes, samples, median_error_points, p90_error_points, inside_band) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (day, window_key, horizon_minutes) DO UPDATE SET samples = EXCLUDED.samples, median_error_points = EXCLUDED.median_error_points, p90_error_points = EXCLUDED.p90_error_points, inside_band = EXCLUDED.inside_band`;
}

function accuracyScoreRow(score: AccuracyScore): unknown[] {
  return [
    score.day,
    score.window,
    score.horizon,
    score.samples,
    score.medianErrorPoints,
    score.p90ErrorPoints,
    score.insideBand,
  ];
}

function storedPoint(row: Record<string, unknown>): StoredForecastPoint {
  return {
    madeAt: isoTime(row["made_at"]),
    seatId: String(row["seat_id"]),
    window: String(row["window_key"]) as WindowKey,
    horizon: Number(row["horizon_minutes"]) as HorizonMinutes,
    targetAt: isoTime(row["target_at"]),
    p50: Number(row["p50"]),
    p90: Number(row["p90"]),
  };
}

function storedScore(row: Record<string, unknown>): AccuracyScore {
  return {
    day: String(row["day"]),
    window: String(row["window_key"]) as WindowKey,
    horizon: Number(row["horizon_minutes"]) as HorizonMinutes,
    samples: Number(row["samples"]),
    medianErrorPoints: Number(row["median_error_points"]),
    p90ErrorPoints: Number(row["p90_error_points"]),
    insideBand: Number(row["inside_band"]),
  };
}
