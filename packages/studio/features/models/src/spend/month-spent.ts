import { spendByMonth } from "@halonicjs/app";
import type { RunsListState } from "@halonicjs/studio-feature-runs/api";

/** This month's estimated cost from the shared run list; `undefined` until a list has loaded. */
export function monthSpent(state: RunsListState | undefined): number | undefined {
  if (state === undefined || !state.loaded) return undefined;
  const summaries = state.runs.map(({ summary }) => summary);
  return spendByMonth(summaries, new Date().toISOString(), 1)[0]?.spent;
}
