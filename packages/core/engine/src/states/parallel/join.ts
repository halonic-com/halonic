import type { WorkflowState } from "@halonicjs/format";
import type { DecidedEvent } from "../../kernel/decide-types.ts";
import type { StateStep } from "../../kernel/registry.ts";
import { type BranchEnd, branchesOf, type ParallelBranches } from "../../kernel/run-branches.ts";

/** A branch's name and how it ended. */
interface EndedBranch {
  readonly name: string;
  readonly end: BranchEnd;
}

/**
 * What a `parallel` state does once a branch has ended: nothing while any
 * branch still runs (branches never cancel each other); then, with every
 * branch ended, it either fails or writes the results and finishes `done`.
 *
 * - `join: all` (the default) fails when any branch failed, with the first
 *   failed branch in name order, unless `continueOnError` is set.
 * - `join: any` fails only when every branch failed.
 *
 * Results go to the context under each branch's name, in name order: the
 * answer, or `{ error }` for a failed branch. With `output`, they also go
 * there as one map.
 */
export function joinBranches(
  stateId: string,
  state: WorkflowState,
  parallel: ParallelBranches | null,
): StateStep {
  const ended = endedInOrder(state, parallel);
  if (ended === null) {
    return { events: [], effects: [] };
  }
  const failed = ended.filter((branch) => "error" in branch.end);
  const firstFailed = failed[0];
  const failsState =
    state.join === "any" ? failed.length === ended.length : state.continueOnError !== true;
  if (firstFailed !== undefined && failsState) {
    return failedState(stateId, state, firstFailed);
  }
  return {
    events: resultEvents(state, ended),
    effects: [],
    outcome: { type: "finish", event: "done" },
  };
}

/** Every branch and how it ended, in name order, or `null` while any of them hasn't ended. */
function endedInOrder(
  state: WorkflowState,
  parallel: ParallelBranches | null,
): readonly EndedBranch[] | null {
  const ended: EndedBranch[] = [];
  for (const [name] of branchesOf(state)) {
    const end = parallel?.branches.find((branch) => branch.name === name)?.end ?? null;
    if (end === null) {
      return null;
    }
    ended.push({ name, end });
  }
  return ended;
}

function failedState(stateId: string, state: WorkflowState, first: EndedBranch): StateStep {
  const end = first.end;
  const error = "error" in end ? end.error : "";
  const reason = "reason" in end ? end.reason : "error";
  const what =
    state.join === "any"
      ? `Every branch of parallel state "${stateId}" failed; the first, "${first.name}"`
      : `Branch "${first.name}" of parallel state "${stateId}"`;
  return {
    events: [],
    effects: [],
    outcome: { type: "fail", error: `${what} failed: ${error}`, reason },
  };
}

function resultEvents(state: WorkflowState, ended: readonly EndedBranch[]): DecidedEvent[] {
  const results: Record<string, unknown> = {};
  const events: DecidedEvent[] = [];
  for (const { name, end } of ended) {
    const value = "error" in end ? { error: end.error } : end.output;
    results[name] = value;
    events.push({ type: "context.updated", key: name, value });
  }
  if (state.output !== undefined) {
    events.push({ type: "context.updated", key: state.output, value: results });
  }
  return events;
}
