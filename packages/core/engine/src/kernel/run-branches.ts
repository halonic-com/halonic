import type { CantTryStep, RunFailureReason } from "@halonicjs/events";
import type { Branch, WorkflowState } from "@halonicjs/format";
import type { PendingCall } from "./run-state.ts";

/**
 * A `parallel` state's branches in name order. Runs keep their definitions
 * as canonical JSON, whose keys are sorted, so the file's order is gone by
 * the time a run reads them; name order is the same in every run.
 */
export function branchesOf(state: WorkflowState): [string, Branch][] {
  // Names are keys, so no two are equal; code-unit order doesn't depend on the locale.
  return Object.entries(state.branches ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
}

/**
 * How a branch ended: its agent's answer, why it failed, or the step it
 * couldn't try, which ends the branch as a failure does.
 */
export type BranchEnd =
  | { readonly output: unknown }
  | { readonly error: string; readonly reason: RunFailureReason }
  | { readonly error: string; readonly cantTry: CantTryStep };

/** One branch of a `parallel` state, from its `agent.started` on. */
export interface RunningBranch {
  readonly name: string;
  /** The model call the branch waits on; `null` once it has ended. */
  readonly call: PendingCall | null;
  /** How the branch ended; `null` while its call runs. */
  readonly end: BranchEnd | null;
}

/** The branches of the `parallel` state the run is in, in the order they started. */
export interface ParallelBranches {
  readonly branches: readonly RunningBranch[];
}

/** A branch's agent asked for its model call. */
export function startBranch(
  parallel: ParallelBranches | null,
  name: string,
  call: PendingCall,
): ParallelBranches {
  const others = (parallel?.branches ?? []).filter((branch) => branch.name !== name);
  return { branches: [...others, { name, call, end: null }] };
}

/** A branch's agent answered or failed; a branch that isn't running changes nothing. */
export function endBranch(
  parallel: ParallelBranches | null,
  name: string,
  end: BranchEnd,
): ParallelBranches | null {
  if (parallel === null) {
    return null;
  }
  const branches = parallel.branches.map((branch) =>
    branch.name === name && branch.end === null ? { ...branch, call: null, end } : branch,
  );
  return { branches };
}

/** The running branch that waits on this call, or `null`. */
export function branchOfCall(
  parallel: ParallelBranches | null,
  callId: string,
): RunningBranch | null {
  return parallel?.branches.find((branch) => branch.call?.callId === callId) ?? null;
}
