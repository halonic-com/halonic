// What a run costs with its sub-runs: the number the engine stops a run on, and the
// Studio shows beside the run, so the two always agree.

import type { RunSummary } from "@halonicjs/events";

type TreeRun = Pick<RunSummary, "id" | "parentRunId" | "cost" | "unpricedCalls">;

/**
 * The cost of the run `top` and of every run under it, by the summaries' `parentRunId`: what the
 * engine stops a run on, since a child run spends from its top-level run's budget.
 */
export function treeCost(summaries: readonly TreeRun[], top: string): number {
  return sumTree(summaries, top, (run) => run.cost);
}

/** The calls without a price in the run `top` and in every run under it, counted like `treeCost`. */
export function treeUnpriced(summaries: readonly TreeRun[], top: string): number {
  return sumTree(summaries, top, (run) => run.unpricedCalls);
}

function sumTree(
  summaries: readonly TreeRun[],
  top: string,
  value: (run: TreeRun) => number,
): number {
  const children = new Map<string, TreeRun[]>();
  for (const summary of summaries) {
    if (summary.parentRunId === null) continue;
    children.set(summary.parentRunId, [...(children.get(summary.parentRunId) ?? []), summary]);
  }
  const first = summaries.find((summary) => summary.id === top);
  let total = first ? value(first) : 0;
  const pending = [...(children.get(top) ?? [])];
  // Ids are unique in a store, but a damaged log must not count a run twice.
  const counted = new Set([top]);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (counted.has(next.id)) continue;
    counted.add(next.id);
    total += value(next);
    pending.push(...(children.get(next.id) ?? []));
  }
  return total;
}
