import type { RunFailureReason } from "@halonicjs/events";
import { promptFor, withGets } from "@halonicjs/workflow";
import type { DecidedEvent, DecideInput, Effect } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import {
  type BranchEnd,
  branchesOf,
  branchOfCall,
  endBranch,
  type RunningBranch,
} from "../../kernel/run-branches.ts";
import { programHarnessOf } from "../task/state.ts";
import { joinBranches } from "./join.ts";

/**
 * A `parallel` state starts every branch's agent at once, in name order
 * (see {@link branchesOf}), each with its own model call, and waits for all of them; branches never cancel each other.
 * Each branch's `agent.started` and `agent.finished` carry `branch`. A branch
 * whose call fails, or whose agent stops for an approval (a branch can't
 * wait for a person), ends with `agent.finished` and an `error`, and the run
 * goes on. Once every branch has ended, {@link joinBranches} decides how the
 * state ends. Branches whose agent runs in a program harness join later.
 */
export const parallelState: StateHandler<"parallel"> = {
  type: "parallel",
  enter: startBranches,
  onInput: takeBranchResult,
};

function startBranches({ run, stateId, state, scope, agents }: StateContext): StateStep {
  const branches = branchesOf(state);
  if (branches.length === 0) {
    return failed(`Parallel state "${stateId}" has no branches.`);
  }
  const events: DecidedEvent[] = [];
  const effects: Effect[] = [];
  for (const [name, branch] of branches) {
    const harness = programHarnessOf(agents, branch.agent);
    if (harness !== null) {
      return failed(
        `Branch "${name}" of parallel state "${stateId}" runs agent "${branch.agent}" in the ` +
          `"${harness}" harness, and parallel branches can't run a harness yet.`,
      );
    }
    // Each agent.started takes the next call id as it is folded in.
    const callId = `call-${run.calls + events.length + 1}`;
    const prompt = withGets(promptFor(branch.input, scope, run.input), state.gets, scope);
    events.push({
      type: "agent.started",
      state: stateId,
      agent: branch.agent,
      prompt,
      branch: name,
    });
    effects.push({ type: "call-model", callId, state: stateId, agent: branch.agent, prompt });
  }
  return { events, effects };
}

/**
 * Only the result of a call a branch waits on counts. Any other, such as
 * one delivered twice after a retry, changes nothing.
 */
function takeBranchResult(context: StateContext, input: DecideInput): StateStep {
  if (input.type !== "effect-done" && input.type !== "effect-failed") {
    return nothing;
  }
  const branch = branchOfCall(context.run.parallel, input.callId);
  if (branch === null || branch.call?.state !== context.stateId) {
    return nothing;
  }
  if (input.type === "effect-failed") {
    return endWith(context, branch, { error: input.error, reason: input.reason });
  }
  switch (input.result.type) {
    case "model":
    case "harness":
      return endWith(context, branch, { output: input.result.output });
    case "approval":
      return endWith(context, branch, approvalRefused(context.stateId, branch, input.result.tool));
    case "effect":
      return endWith(context, branch, effectRefused(context.stateId, branch, input.result.tool));
    case "tool":
      return nothing;
  }
}

/** Records how the branch ended, then joins the branches if it was the last one running. */
function endWith(context: StateContext, branch: RunningBranch, end: BranchEnd): StateStep {
  const { run, stateId, state } = context;
  const agent = branch.call?.agent ?? "";
  const finished: DecidedEvent =
    "error" in end
      ? {
          type: "agent.finished",
          state: stateId,
          agent,
          output: null,
          error: end.error,
          reason: end.reason,
          branch: branch.name,
        }
      : { type: "agent.finished", state: stateId, agent, output: end.output, branch: branch.name };
  const join = joinBranches(stateId, state, endBranch(run.parallel, branch.name, end));
  return { ...join, events: [finished, ...join.events] };
}

function approvalRefused(stateId: string, branch: RunningBranch, tool: string): BranchEnd {
  const agent = branch.call?.agent ?? "";
  return {
    error:
      `Agent "${agent}" in branch "${branch.name}" of parallel state "${stateId}" stopped ` +
      `for an OK on tool "${tool}", and a parallel branch can't wait for a person.`,
    reason: "error",
  };
}

/**
 * A run records one connector call that can change things at a time, so a
 * branch can't stop at that boundary while the others go on.
 */
function effectRefused(stateId: string, branch: RunningBranch, tool: string): BranchEnd {
  const agent = branch.call?.agent ?? "";
  return {
    error:
      `Agent "${agent}" in branch "${branch.name}" of parallel state "${stateId}" stopped ` +
      `before a call to tool "${tool}" that can change things, and a parallel branch can't make one.`,
    reason: "error",
  };
}

function failed(error: string, reason: RunFailureReason = "error"): StateStep {
  return { ...nothing, outcome: { type: "fail", error, reason } };
}
