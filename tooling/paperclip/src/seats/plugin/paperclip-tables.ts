import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { AgentSignInFields } from "../agent-seat.ts";
import type { AgentId } from "../records.ts";
import type { CostRow } from "../usage-buckets.ts";

/** One agent now: the fields that choose its seat, and what it has on. */
export interface AgentNow extends AgentSignInFields {
  readonly agentId: AgentId;
  /** The agent's name in Paperclip, for the proposals; `undefined` when it has none. */
  readonly name: string | undefined;
  /** The model in the agent's settings; empty when they name none. */
  readonly model: string;
  readonly cap: number | undefined;
  readonly runningRuns: number;
  readonly queuedRuns: number;
  readonly openTasks: number;
}

/** What `seats.history` reads from Paperclip's own tables, so tests can fake it. */
export interface PaperclipTables {
  agentsNow(companyId: string): Promise<AgentNow[]>;
  /** The company's cost rows recorded at or after `since`. */
  costRowsSince(companyId: string, since: string): Promise<CostRow[]>;
}

// Each query names the settings fields it needs and never the whole
// `adapter_config` or `runtime_config`, which also hold keys and other settings.
// The folder and connection id stay in the worker's memory, to be compared.
const agentsSql = `SELECT a.id AS agent_id, a.name AS name,
  coalesce(a.adapter_config->'env'->'CLAUDE_CONFIG_DIR'->>'value', a.adapter_config->'env'->>'CLAUDE_CONFIG_DIR') AS config_dir,
  a.runtime_config->'aiConnection'->>'connectionId' AS connection_id,
  a.adapter_config->>'model' AS model,
  a.runtime_config->'heartbeat'->>'maxConcurrentRuns' AS cap,
  (SELECT count(*) FROM public.heartbeat_runs r WHERE r.agent_id = a.id AND r.status = 'running')::int AS running_runs,
  (SELECT count(*) FROM public.heartbeat_runs r WHERE r.agent_id = a.id AND r.status = 'queued')::int AS queued_runs,
  (SELECT count(*) FROM public.issues i WHERE i.assignee_agent_id = a.id AND i.status IN ('todo', 'in_progress'))::int AS open_tasks
FROM public.agents a
WHERE a.company_id = $1 AND a.status <> 'terminated'`;

const costRowsSql = `SELECT agent_id, coalesce(heartbeat_run_id, id) AS run_id, model, occurred_at,
  input_tokens, cached_input_tokens, output_tokens
FROM public.cost_events
WHERE company_id = $1 AND agent_id IS NOT NULL AND occurred_at >= $2`;

/** The tables on Paperclip's database, read through the plugin's `coreReadTables`. */
export function databaseTables(db: PluginDatabaseClient): PaperclipTables {
  return {
    async agentsNow(companyId) {
      const rows = await db.query<Record<string, unknown>>(agentsSql, [companyId]);
      return rows.map((row) => ({
        agentId: String(row["agent_id"]),
        name: optionalText(row["name"]),
        configDir: optionalText(row["config_dir"]),
        connectionId: optionalText(row["connection_id"]),
        model: optionalText(row["model"]) ?? "",
        cap: positiveWhole(row["cap"]),
        runningRuns: Number(row["running_runs"] ?? 0),
        queuedRuns: Number(row["queued_runs"] ?? 0),
        openTasks: Number(row["open_tasks"] ?? 0),
      }));
    },
    async costRowsSince(companyId, since) {
      const rows = await db.query<Record<string, unknown>>(costRowsSql, [companyId, since]);
      return rows.map((row) => ({
        agentId: String(row["agent_id"]),
        runId: String(row["run_id"]),
        model: optionalText(row["model"]) ?? "",
        occurredAt: isoTime(row["occurred_at"]),
        inputTokens: Number(row["input_tokens"] ?? 0),
        cachedInputTokens: Number(row["cached_input_tokens"] ?? 0),
        outputTokens: Number(row["output_tokens"] ?? 0),
      }));
    },
  };
}

/** A database time, which arrives as a `Date` or as text, as an ISO time in UTC. */
export function isoTime(value: unknown): string {
  return new Date(value instanceof Date ? value : String(value)).toISOString();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function positiveWhole(value: unknown): number | undefined {
  const number = Number(value);
  return value !== null && Number.isInteger(number) && number > 0 ? number : undefined;
}
