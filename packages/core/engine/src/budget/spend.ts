// What a run and the month have spent, read from the run store's summaries.
// A summary's `cost` is the sum of its priced model calls, without the calls
// a subscription paid for (requirement `events.summary-cost`), so the budget
// counts exactly what Halonic spends and never adds up `llm.response` itself.

import type { RunSummary } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import type { RunState } from "../kernel/run-state.ts";
import type { Spend } from "./budget.ts";

/** How deep a run's parents are followed up: far past the deepest child run. */
const maxParentHops = 64;

/**
 * What has been spent for `run` and in the month of `at`. A child run spends
 * from its top-level run's budget, so the run spend is the cost of the
 * top-level run and of every child run under it. The month counts every run
 * that started in the same calendar month (UTC) as `at`.
 *
 * It lists only the runs that started since the earlier of the month's
 * start and the top-level run's start, since a child run starts after its
 * parent: the cost of a paid call doesn't grow with the workspace's history.
 * The list may lag the log for a short time in a cloud store; the local
 * stores are always up to date.
 *
 * @param at - the ISO time of the input being decided
 */
export async function spendOf(
  runs: Pick<RunStore, "get" | "list">,
  run: RunState,
  at: string,
): Promise<Spend> {
  const month = at.slice(0, 7);
  const monthStart = `${month}-01T00:00:00.000Z`;
  const top = await topRunOf(runs, run);
  const topStart = (await runs.get(top))?.startedAt ?? at;
  const since = Date.parse(topStart) < Date.parse(monthStart) ? topStart : monthStart;
  const summaries = await runs.list({ startedSince: since });
  const monthSpend = summaries
    .filter((summary) => summary.startedAt.slice(0, 7) === month)
    .reduce((total, summary) => total + summary.cost, 0);
  return { run: treeCost(summaries, top), month: monthSpend };
}

/** The run at the top of `run`'s parents: `run` itself when it has none. */
async function topRunOf(runs: Pick<RunStore, "get">, run: RunState): Promise<string> {
  let top = run.runId;
  let parent = run.parent?.runId ?? null;
  for (let hop = 0; parent !== null && hop < maxParentHops; hop += 1) {
    top = parent;
    parent = (await runs.get(parent))?.parentRunId ?? null;
  }
  return top;
}

/** The cost of `top` and of every run under it, by the summaries' `parentRunId`. */
function treeCost(summaries: readonly RunSummary[], top: string): number {
  const children = new Map<string, RunSummary[]>();
  for (const summary of summaries) {
    if (summary.parentRunId === null) continue;
    children.set(summary.parentRunId, [...(children.get(summary.parentRunId) ?? []), summary]);
  }
  let total = summaries.find((summary) => summary.id === top)?.cost ?? 0;
  const pending = [...(children.get(top) ?? [])];
  // Ids are unique in a store, but a damaged log must not count a run twice.
  const counted = new Set([top]);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (counted.has(next.id)) continue;
    counted.add(next.id);
    total += next.cost;
    pending.push(...(children.get(next.id) ?? []));
  }
  return total;
}
