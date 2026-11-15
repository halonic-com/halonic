// What a run costs with its sub-runs: the number the engine stops a run on, and the
// Studio shows beside the run, so the two always agree.

import type { RunSummary } from "@halonicjs/events";

/**
 * The cost of the run `top` and of every run under it, by the summaries' `parentRunId`: what the
 * engine stops a run on, since a child run spends from its top-level run's budget.
 */
export function treeCost(
  summaries: readonly Pick<RunSummary, "id" | "parentRunId" | "cost">[],
  top: string,
): number {
  const children = new Map<string, Pick<RunSummary, "id" | "parentRunId" | "cost">[]>();
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
