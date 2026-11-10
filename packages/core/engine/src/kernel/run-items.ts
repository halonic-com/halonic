import type { PendingCall } from "./run-state.ts";

/**
 * One item of a `foreach` state that has started and not ended: the call
 * its agent waits on, or the child run of the workflow it runs.
 */
export type RunningItem =
  | { readonly item: number; readonly call: PendingCall }
  | { readonly item: number; readonly childRunId: string; readonly workflow: string };

/**
 * The items of the `foreach` state the run is in, from its first item's
 * `agent.started` or `workflow.started` until the run leaves the state.
 */
export interface ForeachItems {
  readonly state: string;
  /** How many items have started; the next one to start is item `started`. */
  readonly started: number;
  /** The items that have started and not ended, in the order they started. */
  readonly running: readonly RunningItem[];
  /** What each item gave, by item; `null` for an item that hasn't ended. */
  readonly results: readonly unknown[];
}

/** An item started, in state `stateId`: it runs until its `agent.finished` or `workflow.finished`. */
export function startItem(
  items: ForeachItems | null,
  stateId: string,
  running: RunningItem,
): ForeachItems {
  const now = items?.state === stateId ? items : null;
  return {
    state: stateId,
    started: Math.max(now?.started ?? 0, running.item + 1),
    running: [...(now?.running ?? []), running],
    results: now?.results ?? [],
  };
}

/** An item ended and gave `output`; an item that isn't running changes nothing. */
export function finishItem(
  items: ForeachItems | null,
  stateId: string,
  item: number,
  output: unknown,
): ForeachItems | null {
  if (items?.state !== stateId || !items.running.some((running) => running.item === item)) {
    return items;
  }
  const results = Array.from({ length: Math.max(items.results.length, item + 1) }, (_, index) =>
    index === item ? output : (items.results[index] ?? null),
  );
  return {
    ...items,
    running: items.running.filter((running) => running.item !== item),
    results,
  };
}

/** The call an item's agent waits on with this id, or `null` when no item does. */
export function itemCallOf(items: ForeachItems | null, callId: string): PendingCall | null {
  for (const running of items?.running ?? []) {
    if ("call" in running && running.call.callId === callId) return running.call;
  }
  return null;
}
