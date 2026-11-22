import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { PlacementChanges } from "../placements.ts";
import type { AgentActivity, AgentUsage, Placement, PlacementSource } from "../records.ts";
import { isoTime } from "./paperclip-tables.ts";

/** What `seats.history` reads from and writes to the plugin's own tables. */
export interface HistoryStore {
  /** The placements still open, or ended at or after `since`. */
  placementsSince(since: string): Promise<Placement[]>;
  savePlacementChanges(changes: PlacementChanges): Promise<void>;
  /** Stores each bucket, replacing what an earlier run stored for the same key. */
  saveUsage(usage: readonly AgentUsage[]): Promise<void>;
  recordActivity(activity: readonly AgentActivity[]): Promise<void>;
}

/** The history store in the schema Paperclip gives the plugin (`ctx.db.namespace`). */
export function databaseHistoryStore(db: PluginDatabaseClient): HistoryStore {
  const schema = db.namespace;
  return {
    async placementsSince(since) {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT agent_id, seat_id, from_at, to_at, source FROM ${schema}.placement WHERE to_at IS NULL OR to_at >= $1`,
        [since],
      );
      return rows.map((row) => ({
        agentId: String(row["agent_id"]),
        seatId: String(row["seat_id"]),
        from: isoTime(row["from_at"]),
        to: row["to_at"] === null || row["to_at"] === undefined ? undefined : isoTime(row["to_at"]),
        source: row["source"] as PlacementSource,
      }));
    },
    async savePlacementChanges(changes) {
      for (const placement of changes.closed) {
        await db.execute(
          `UPDATE ${schema}.placement SET to_at = $1 WHERE agent_id = $2 AND from_at = $3 AND to_at IS NULL`,
          [placement.to, placement.agentId, placement.from],
        );
      }
      for (const placement of changes.opened) {
        await db.execute(
          `INSERT INTO ${schema}.placement (agent_id, seat_id, from_at, to_at, source) VALUES ($1, $2, $3, NULL, $4) ON CONFLICT (agent_id, from_at) DO NOTHING`,
          [placement.agentId, placement.seatId, placement.from, placement.source],
        );
      }
    },
    async saveUsage(usage) {
      for (const bucket of usage) {
        await db.execute(usageSql(schema), [
          bucket.agentId,
          bucket.seatId ?? null,
          bucket.model,
          bucket.bucketStart,
          bucket.inputTokens,
          bucket.cachedInputTokens,
          bucket.outputTokens,
          bucket.runs,
        ]);
      }
    },
    async recordActivity(activity) {
      for (const row of activity) {
        await db.execute(activitySql(schema), [
          row.agentId,
          row.at,
          row.runningRuns,
          row.queuedRuns,
          row.openTasks,
          row.cap ?? null,
          row.model,
        ]);
      }
    },
  };
}

/** Stores one usage bucket; a later sum for the same key replaces it. */
function usageSql(schema: string): string {
  return `INSERT INTO ${schema}.agent_usage (agent_id, seat_id, model, bucket_start, input_tokens, cached_input_tokens, output_tokens, runs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (agent_id, (coalesce(seat_id, '')), model, bucket_start) DO UPDATE SET input_tokens = EXCLUDED.input_tokens, cached_input_tokens = EXCLUDED.cached_input_tokens, output_tokens = EXCLUDED.output_tokens, runs = EXCLUDED.runs`;
}

/** Stores one activity row; a second one for the same agent and time is the same row. */
function activitySql(schema: string): string {
  return `INSERT INTO ${schema}.agent_activity (agent_id, at, running_runs, queued_runs, open_tasks, run_cap, model) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (agent_id, at) DO NOTHING`;
}
