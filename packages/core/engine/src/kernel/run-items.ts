import type { PendingCall } from "./run-state.ts";

/** One item of a `foreach` state that has started and not ended: the call its agent waits on. */
export interface RunningItem {
  /** The item's place in the list, 0-based. */
  readonly item: number;
  readonly call: PendingCall;
}

/**
 * The items of the `foreach` state the run is in, from its first
 * `agent.started` with an `item` until the run leaves the state.
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

/** An item's agent was asked for its call: it runs until its `agent.finished`. */
export function startItem(
  items: ForeachItems | null,
  item: number,
  call: PendingCall,
): ForeachItems {
  const now = items?.state === call.state ? items : null;
  return {
    state: call.state,
    started: Math.max(now?.started ?? 0, item + 1),
    running: [...(now?.running ?? []), { item, call }],
    results: now?.results ?? [],
  };
}

/** An item's agent finished with `output`; an item that isn't running changes nothing. */
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
