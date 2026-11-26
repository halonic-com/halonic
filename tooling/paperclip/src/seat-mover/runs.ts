import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";

/**
 * The runs the seat mover looks at (HAL-19354), read from Paperclip's
 * `heartbeat_runs` through the plugin's `coreReadTables`: runs parked for a
 * seat that never started, and recent `provider_quota` failures as an instant
 * "seat full" signal. Only ids, states, times and the run's connection id are
 * read; never a run's error text, log or output.
 */

/** Why Paperclip parks a run for a seat: a pool wait, or a wait on the provider's limit. */
export const parkedReasons = [
  "ai_connection_pool_wait",
  "provider_limit_wait",
  "provider_quota_recovery",
] as const;

/** A run waiting for a seat that never started. */
export interface ParkedRun {
  readonly id: string;
  readonly agentId: string;
  readonly issueId: string | undefined;
  /** The seat the run is pinned to, from its context; `undefined` when it names none. */
  readonly connectionId: string | undefined;
  readonly retryAt: string | undefined;
}

/** The newest `provider_quota` failure on one seat. */
export interface QuotaFailure {
  readonly connectionId: string;
  readonly at: string;
}

export interface SeatRuns {
  parked(companyId: string): Promise<ParkedRun[]>;
  quotaFailuresSince(companyId: string, since: string): Promise<QuotaFailure[]>;
}

const connectionOf = `r.context_snapshot -> 'aiConnection' ->> 'connectionId'`;

/**
 * Paperclip's plugin `db.query` expands an array parameter into a row of
 * parameters (`($2, $3, $4)`), which Postgres can't cast to `text[]`. So every
 * reason is its own scalar parameter: `IN ($2, $3, $4)`.
 */
const reasonParams = parkedReasons.map((_, index) => `$${index + 2}`).join(", ");

const parkedSql = `SELECT r.id AS id, r.agent_id AS agent_id, r.issue_id AS issue_id,
  ${connectionOf} AS connection_id, r.scheduled_retry_at AS retry_at
FROM public.heartbeat_runs r
WHERE r.company_id = $1 AND r.status = 'scheduled_retry' AND r.started_at IS NULL
  AND r.scheduled_retry_reason IN (${reasonParams})`;

const quotaSql = `SELECT ${connectionOf} AS connection_id, max(coalesce(r.finished_at, r.updated_at)) AS at
FROM public.heartbeat_runs r
WHERE r.company_id = $1 AND r.error_code = 'provider_quota' AND r.created_at >= $2
  AND ${connectionOf} IS NOT NULL
GROUP BY 1`;

const optional = (value: unknown) =>
  value === null || value === undefined ? undefined : String(value);

function isoTime(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return new Date(value instanceof Date ? value : String(value)).toISOString();
}

/** The read on Paperclip's database. */
export function databaseSeatRuns(db: Pick<PluginDatabaseClient, "query">): SeatRuns {
  return {
    async parked(companyId) {
      const rows = await db.query<Record<string, unknown>>(parkedSql, [
        companyId,
        ...parkedReasons,
      ]);
      return rows.map((row) => ({
        id: String(row["id"]),
        agentId: String(row["agent_id"]),
        issueId: optional(row["issue_id"]),
        connectionId: optional(row["connection_id"]),
        retryAt: isoTime(row["retry_at"]),
      }));
    },
    async quotaFailuresSince(companyId, since) {
      const rows = await db.query<Record<string, unknown>>(quotaSql, [companyId, since]);
      return rows.flatMap((row) => {
        const at = isoTime(row["at"]);
        return at === undefined ? [] : [{ connectionId: String(row["connection_id"]), at }];
      });
    },
  };
}
