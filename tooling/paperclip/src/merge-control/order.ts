import type { MergeAction } from "./state.ts";

/** Where each kind of action goes: removals, then enqueues, then everything else. */
function rank(action: MergeAction): number {
  if (action.kind === "dequeue") {
    return 0;
  }
  if (action.kind === "enqueue") {
    return 1;
  }
  return 2;
}

/**
 * Queue first, analyse after (HAL-17906): the action layer carries actions
 * out one at a time, so the queue writes go first and a pass's comments,
 * reruns, cancels and wakes can't hold up an enqueue. Removals still go
 * before enqueues, because an enqueue behind a pull request that then
 * leaves would have its merge group rebuilt. Within each kind the order
 * `decide` chose stays as it was.
 */
export function queueFirst(actions: readonly MergeAction[]): MergeAction[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => rank(a.action) - rank(b.action) || a.index - b.index)
    .map((each) => each.action);
}
