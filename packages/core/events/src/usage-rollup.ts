// Tokens per run, per task and per pull request (requirement
// `events.usage-rollup`), the numbers the token-saving work measures first.
// A call counts by the same rule as a run's summary, so the totals here and
// on a run's page never disagree.

import { addUsage } from "./add-usage.ts";
import type { AgentSessionStart } from "./agent-started.ts";
import { modelCallCharge } from "./model-call-charge.ts";
import type { Usage } from "./run-basics.ts";
import type { RunEvent } from "./run-event.ts";
import type { RunTask } from "./run-task.ts";
import { upgradeEvent } from "./upgrade.ts";

/** How the harness sessions of agents began: how many were fresh, by reason, and how many resumed. */
export interface SessionStarts {
  fresh: number;
  /** Fresh starts by their reason code, such as `{ "no-session": 2 }`. */
  freshReasons: Record<string, number>;
  resumed: number;
}

/** The tokens of one run or of several, added up. */
export interface UsageTotal {
  /** The tokens of every model call, sub-agents' included. An answer from the cache adds nothing. */
  usage: Usage;
  /** The part of `usage` that sub-agents used. */
  subAgentUsage: Usage;
  /** The model calls a model answered, not the cache. */
  calls: number;
  sessions: SessionStarts;
}

/** The tokens of one run, with the task it worked on. */
export interface RunUsage extends UsageTotal {
  runId: string;
  /** The run that started this one (subflows), or `null` for a top-level run. */
  parentRunId: string | null;
  /** The task `run.started` names, or `null` when it names none. */
  task: RunTask | null;
}

/** The tokens of the runs on one task or one branch, and which runs they were, oldest first. */
export interface UsageRollup extends UsageTotal {
  runIds: string[];
}

/**
 * The tokens one run used, worked out from its log.
 *
 * @param events - the run's events, oldest first
 * @returns the run's usage, or `null` when the log doesn't start with `run.started`
 *
 * @example
 * const usage = runUsageOf(await runStore.events(runId));
 * // { runId, task: { id: "HAL-42" }, usage: { inputTokens: 1200, … }, subAgentUsage: …, calls: 3, … }
 */
export function runUsageOf(events: readonly RunEvent[]): RunUsage | null {
  const firstEvent = events[0];
  if (firstEvent === undefined) return null;
  const first = upgradeEvent(firstEvent);
  if (first.type !== "run.started") return null;
  const total = emptyTotal();
  const subAgents = new Set<string>();
  for (const event of events) countEvent(total, subAgents, event);
  return {
    runId: first.runId,
    parentRunId: first.parent?.runId ?? null,
    task: first.task ?? null,
    ...total,
  };
}

/** Adds one event of a run to its total; `subAgents` collects the agents a parent started. */
function countEvent(total: UsageTotal, subAgents: Set<string>, event: RunEvent): void {
  if (event.type === "agent.started") {
    if (event.parent !== undefined) subAgents.add(event.agent);
    if (event.session !== undefined) countSession(total.sessions, event.session);
    return;
  }
  if (event.type !== "llm.response") return;
  const charge = modelCallCharge(event);
  if (charge.usage === null) return;
  total.usage = addUsage(total.usage, charge.usage);
  if (subAgents.has(event.agent)) {
    total.subAgentUsage = addUsage(total.subAgentUsage, charge.usage);
  }
  total.calls += 1;
}

/**
 * The runs' tokens added up per task, keyed by the task's id. A run that
 * names no task is left out. A child run counts on its own, so pass it too:
 * it names its parent's task.
 *
 * @example
 * usageByTask([first, second]).get("HAL-42")?.usage; // both runs' tokens together
 */
export function usageByTask(runs: readonly RunUsage[]): ReadonlyMap<string, UsageRollup> {
  return rollUp(runs, (run) => run.task?.id);
}

/**
 * The runs' tokens added up per branch, keyed by the branch's name, which
 * stands for its pull request. A run whose task names no branch is left out.
 */
export function usageByBranch(runs: readonly RunUsage[]): ReadonlyMap<string, UsageRollup> {
  return rollUp(runs, (run) => run.task?.branch);
}

function rollUp(
  runs: readonly RunUsage[],
  keyOf: (run: RunUsage) => string | undefined,
): Map<string, UsageRollup> {
  const rollups = new Map<string, UsageRollup>();
  for (const run of runs) {
    const key = keyOf(run);
    if (key === undefined) continue;
    const rollup = rollups.get(key) ?? { ...emptyTotal(), runIds: [] };
    rollup.usage = addUsage(rollup.usage, run.usage);
    rollup.subAgentUsage = addUsage(rollup.subAgentUsage, run.subAgentUsage);
    rollup.calls += run.calls;
    rollup.sessions = addSessions(rollup.sessions, run.sessions);
    rollup.runIds.push(run.runId);
    rollups.set(key, rollup);
  }
  return rollups;
}

function emptyTotal(): UsageTotal {
  const none = { inputTokens: 0, outputTokens: 0 };
  return {
    usage: none,
    subAgentUsage: none,
    calls: 0,
    sessions: { fresh: 0, freshReasons: {}, resumed: 0 },
  };
}

function countSession(sessions: SessionStarts, session: AgentSessionStart): void {
  if (session.start === "resumed") {
    sessions.resumed += 1;
    return;
  }
  sessions.fresh += 1;
  sessions.freshReasons = addCounts(sessions.freshReasons, { [session.reason]: 1 });
}

function addSessions(total: SessionStarts, more: SessionStarts): SessionStarts {
  return {
    fresh: total.fresh + more.fresh,
    freshReasons: addCounts(total.freshReasons, more.freshReasons),
    resumed: total.resumed + more.resumed,
  };
}

// Through a Map, because the bridge picks the reason codes: one such as
// `__proto__` must count like any other, not change the object.
function addCounts(
  counts: Record<string, number>,
  more: Record<string, number>,
): Record<string, number> {
  const added = new Map(Object.entries(counts));
  for (const [key, count] of Object.entries(more)) added.set(key, (added.get(key) ?? 0) + count);
  return Object.fromEntries(added);
}
