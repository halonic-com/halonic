import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import { type CauseCode, causeCodes, causePatterns } from "../board-check/failed-runs.ts";

/**
 * The Worker agents page's read of Paperclip's own task and run tables
 * (HAL-16249, addendum 2 on HAL-15997). Every query names its columns, and
 * none returns a run's error text, logs or output, or a task's title or
 * description. A failed run's cause is worked out inside the database from its
 * error code and text with the board check's patterns, so only the cause code
 * reaches the plugin.
 */

/** A task in progress: its key, its agent and when it last changed. */
export interface TaskInProgress {
  readonly agentId: string;
  readonly identifier: string;
  readonly updatedAt: string;
}

/** An agent's newest run: its status, when it was created and its task's key. */
export interface LastRun {
  readonly agentId: string;
  readonly status: string;
  readonly at: string;
  readonly task: string | undefined;
}

/** How many of an agent's runs failed for one cause. */
export interface FailedRunCount {
  readonly agentId: string;
  readonly cause: CauseCode;
  readonly runs: number;
}

/** What the page reads from Paperclip's tables, so tests can fake it. */
export interface WorkerTables {
  tasksInProgress(companyId: string): Promise<TaskInProgress[]>;
  lastRuns(companyId: string): Promise<LastRun[]>;
  /** Failed and timed-out runs created at or after `since`, counted per agent and cause. */
  failedRunsSince(companyId: string, since: string): Promise<FailedRunCount[]>;
}

/** The core tables the read uses; the manifest's `coreReadTables` lists exactly these. */
export const workerReadTables = ["agents", "heartbeat_runs", "issues"] as const;

const tasksInProgressSql = `SELECT i.assignee_agent_id AS agent_id, i.identifier AS identifier, i.updated_at AS updated_at
FROM public.issues i
WHERE i.company_id = $1 AND i.status = 'in_progress' AND i.assignee_agent_id IS NOT NULL AND i.identifier IS NOT NULL
ORDER BY i.updated_at DESC`;

const lastRunsSql = `SELECT a.id AS agent_id, r.status AS status, r.created_at AS created_at, i.identifier AS identifier
FROM public.agents a
CROSS JOIN LATERAL (SELECT r.status, r.created_at, r.issue_id FROM public.heartbeat_runs r
  WHERE r.agent_id = a.id ORDER BY r.created_at DESC LIMIT 1) r
LEFT JOIN public.issues i ON i.id = r.issue_id
WHERE a.company_id = $1`;

// The patterns go in as parameters from $3 on, in causePatterns' order; the
// codes are the fixed ones in code. The error text never leaves this expression.
const causeSql = `CASE WHEN r.status = 'timed_out' THEN 'timeout'
    ${causePatterns.map(([cause], index) => `WHEN concat_ws(' ', r.error_code, r.error) ~* $${index + 3} THEN '${cause}'`).join("\n    ")}
    ELSE 'other' END`;

const failedRunsSql = `SELECT r.agent_id AS agent_id, ${causeSql} AS cause, count(*)::int AS runs
FROM public.heartbeat_runs r
WHERE r.company_id = $1 AND r.status IN ('failed', 'timed_out') AND r.created_at >= $2
GROUP BY 1, 2`;

/** The read on Paperclip's database, through the plugin's `coreReadTables`. */
export function databaseWorkerTables(db: Pick<PluginDatabaseClient, "query">): WorkerTables {
  return {
    async tasksInProgress(companyId) {
      const rows = await db.query<Record<string, unknown>>(tasksInProgressSql, [companyId]);
      return rows.map((row) => ({
        agentId: String(row["agent_id"]),
        identifier: String(row["identifier"]),
        updatedAt: isoTime(row["updated_at"]),
      }));
    },
    async lastRuns(companyId) {
      const rows = await db.query<Record<string, unknown>>(lastRunsSql, [companyId]);
      return rows.map((row) => ({
        agentId: String(row["agent_id"]),
        status: String(row["status"]),
        at: isoTime(row["created_at"]),
        task: typeof row["identifier"] === "string" ? row["identifier"] : undefined,
      }));
    },
    async failedRunsSince(companyId, since) {
      const patterns = causePatterns.map(([, pattern]) => pattern.source);
      const rows = await db.query<Record<string, unknown>>(failedRunsSql, [
        companyId,
        since,
        ...patterns,
      ]);
      return rows.map((row) => ({
        agentId: String(row["agent_id"]),
        cause: knownCause(row["cause"]),
        runs: Number(row["runs"] ?? 0),
      }));
    },
  };
}

function knownCause(value: unknown): CauseCode {
  return (causeCodes as readonly unknown[]).includes(value) ? (value as CauseCode) : "other";
}

function isoTime(value: unknown): string {
  return new Date(value instanceof Date ? value : String(value)).toISOString();
}
