import type { CauseCode } from "../board-check/failed-runs.ts";
import { type AgentChecks, checkCounts, type RuleChecksRecord } from "./rule-checks.ts";
import type { FailedRunCount, LastRun, TaskInProgress, WorkerTables } from "./tables.ts";

/**
 * The Worker agents page's data (addendum 2 on HAL-15997, section 1): the
 * board agents in the top strip, and one row per worker agent with its task in
 * progress, its newest run and its failed runs of the last 24 hours by cause
 * code, and its 5 rule checks from the board check's last pass (HAL-16250).
 * Open PRs come with HAL-16251.
 */

/** The board agents shown in the top strip instead of the table, by url key. */
export const boardAgentKeys = ["board-checker", "merger", "fast-track-monitor", "seat-supervisor"];
/** Agents left out of the page: Pip (addendum 2), and two helper agents that do no task work. */
export const leftOutKeys = ["pip", "seat-probe", "pr-watcher"];

const dayMs = 24 * 60 * 60_000;

/** An agent as Paperclip lists it, limited to what the page shows. */
export interface AgentEntry {
  readonly id: string;
  readonly name: string;
  readonly urlKey: string;
  readonly status: string;
}

/** A run as the page shows it: no run id, no error. */
export interface RunView {
  readonly status: string;
  readonly at: string;
  readonly task: string | undefined;
}

/** A board agent's tile in the top strip. */
export interface BoardAgentTile {
  readonly name: string;
  readonly paused: boolean;
  readonly lastRun: RunView | undefined;
}

/** One worker agent's row. */
export interface WorkerRow {
  readonly name: string;
  readonly paused: boolean;
  /** The task in progress that changed last, and how many more are in progress. */
  readonly current: { readonly task: string; readonly more: number } | undefined;
  readonly lastRun: RunView | undefined;
  /** Failed runs by cause code, most first; empty when none failed. */
  readonly failed: readonly { readonly cause: CauseCode; readonly runs: number }[];
  /** Its rule checks, or undefined before the board check's first pass. */
  readonly checks: AgentChecks | undefined;
}

/** Everything the page shows. */
export interface WorkerAgentsPage {
  readonly at: string;
  /** Failed runs count from here: 24 hours before `at`. */
  readonly failedSince: string;
  /** When the board check last worked out the rule checks, and the GitHub snapshot it used; null before its first pass. */
  readonly checkedAt: string | null;
  readonly prDataAt: string | null;
  readonly boardAgents: readonly BoardAgentTile[];
  readonly agents: readonly WorkerRow[];
  readonly leftOut: readonly string[];
}

/** Reads the tables once and builds the page; it writes nothing. */
export async function workerAgentsPage(
  companyId: string,
  agents: readonly AgentEntry[],
  tables: WorkerTables,
  checks: RuleChecksRecord | undefined,
  now: Date,
): Promise<WorkerAgentsPage> {
  const failedSince = new Date(now.getTime() - dayMs).toISOString();
  const [tasks, runs, failed] = await Promise.all([
    tables.tasksInProgress(companyId),
    tables.lastRuns(
      companyId,
      agents.map((agent) => agent.id),
    ),
    tables.failedRunsSince(companyId, failedSince),
  ]);
  const lastRuns = new Map(runs.map((run) => [run.agentId, runView(run)]));
  const listed = agents.filter((agent) => agent.status !== "terminated");
  const byKey = (keys: readonly string[]) => listed.filter((agent) => keys.includes(agent.urlKey));
  const workers = listed.filter(
    (agent) => !boardAgentKeys.includes(agent.urlKey) && !leftOutKeys.includes(agent.urlKey),
  );
  return {
    at: now.toISOString(),
    failedSince,
    checkedAt: checks?.at ?? null,
    prDataAt: checks?.prDataAt ?? null,
    boardAgents: byKey(boardAgentKeys).map((agent) => ({
      name: agent.name,
      paused: agent.status === "paused",
      lastRun: lastRuns.get(agent.id),
    })),
    agents: workers
      .map((agent) => ({
        ...workerRow(agent, tasks, lastRuns.get(agent.id), failed),
        checks: checks?.agents[agent.id],
      }))
      .sort(worstFirst),
    leftOut: byKey(leftOutKeys).map((agent) => agent.name),
  };
}

function runView(run: LastRun): RunView {
  return { status: run.status, at: run.at, task: run.task };
}

function workerRow(
  agent: AgentEntry,
  tasks: readonly TaskInProgress[],
  lastRun: RunView | undefined,
  failed: readonly FailedRunCount[],
): Omit<WorkerRow, "checks"> {
  // The tables come newest first, so the first task is the one that changed last.
  const own = tasks.filter((task) => task.agentId === agent.id);
  const first = own[0];
  return {
    name: agent.name,
    paused: agent.status === "paused",
    current: first === undefined ? undefined : { task: first.identifier, more: own.length - 1 },
    lastRun,
    failed: failed
      .filter((count) => count.agentId === agent.id && count.runs > 0)
      .map(({ cause, runs }) => ({ cause, runs }))
      .sort((a, b) => b.runs - a.runs || a.cause.localeCompare(b.cause)),
  };
}

function failedTotal(row: WorkerRow): number {
  return row.failed.reduce((sum, count) => sum + count.runs, 0);
}

/** Worst first: most Problems, then most Checks, then most failed runs, then by name. */
function worstFirst(a: WorkerRow, b: WorkerRow): number {
  const [countsA, countsB] = [checkCounts(a.checks), checkCounts(b.checks)];
  return (
    countsB.problems - countsA.problems ||
    countsB.toCheck - countsA.toCheck ||
    failedTotal(b) - failedTotal(a) ||
    a.name.localeCompare(b.name)
  );
}
