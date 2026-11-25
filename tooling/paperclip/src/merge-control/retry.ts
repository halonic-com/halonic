import type { ActResult } from "./act.ts";
import type { MergeAction, MergeState } from "./state.ts";

/**
 * Keeps only what was sent (HAL-17706 review): `decide` records a rerun,
 * comment or dequeue in the state as if it went out, so the next pass
 * doesn't repeat it. When its write failed, the entries it set go back to
 * the state before the pass, and the next pass decides it again.
 */

type Entries<V> = Readonly<Record<string, V>>;

/** `decided` with `key` set back to its value in `before`, or removed. */
function restore<V>(before: Entries<V>, decided: Entries<V>, key: string): Entries<V> {
  const { [key]: _dropped, ...rest } = decided;
  const was = before[key];
  return was === undefined ? rest : { ...rest, [key]: was };
}

/** `decided` with every entry for `runId` set back to its value in `before`. */
function restoreRun(
  before: MergeState["reran"],
  decided: MergeState["reran"],
  runId: number,
): MergeState["reran"] {
  return Object.keys(decided)
    .filter((key) => decided[key]?.run === runId && decided[key] !== before[key])
    .reduce((entries, key) => restore(before, entries, key), decided);
}

/** The state with the entries one failed action set put back. */
function undo(before: MergeState, state: MergeState, action: MergeAction): MergeState {
  switch (action.kind) {
    case "comment":
    case "add-label":
      // The action's key is `<kind>#<number>@<head>`; the state's is the part before `@`.
      return {
        ...state,
        noted: restore(before.noted, state.noted, action.key.split("@")[0] ?? ""),
      };
    case "rerun":
      return { ...state, reran: restoreRun(before.reran, state.reran, action.runId) };
    case "rerun-failed-jobs":
      return {
        ...state,
        reranFlake: restoreRun(before.reranFlake, state.reranFlake, action.runId),
      };
    case "dequeue":
      // The cooldown stays: it counts only once the entry is out, and the
      // dequeue may have gone out with only its comment failing.
      return {
        ...state,
        unmergeableSince: restore(
          before.unmergeableSince,
          state.unmergeableSince,
          String(action.number),
        ),
      };
    case "enqueue":
      return { ...state, lastQueue: state.lastQueue.filter((number) => number !== action.number) };
    case "reopen":
      return {
        ...state,
        labelNoopReopened: restore(
          before.labelNoopReopened,
          state.labelNoopReopened,
          String(action.number),
        ),
      };
    case "cancel-run":
    case "update-branch":
    case "wake":
      return state;
  }
}

/**
 * The state to save after `act`: `decided`, with each action whose write
 * failed undone against `before`. `results` are `act`'s, one per action in
 * the same order.
 */
export function keepSent(
  before: MergeState,
  decided: MergeState,
  actions: readonly MergeAction[],
  results: readonly ActResult[],
): MergeState {
  return actions.reduce(
    (state, action, index) =>
      results[index]?.outcome === "failed" ? undo(before, state, action) : state,
    decided,
  );
}
