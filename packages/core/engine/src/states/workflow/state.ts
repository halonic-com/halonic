import { childInput } from "@halonicjs/workflow";
import type { ChildInput, DecidedEvent, SendInput } from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import type { ChildRun } from "../../kernel/run-state.ts";

/** How deep child runs may nest: a child of a top-level run is 1 deep. */
export const maxChildDepth = 5;

/**
 * A `workflow` state runs another workflow of the hub as a child run. On
 * entry it records `workflow.started` and asks for the child. The child
 * tells it each time it waits or ends: while the child waits, so does this
 * run, with the child's events; when the child runs again, this run records
 * `workflow.resumed` and runs with it; when the child completes, its context
 * goes to `output` and the state finishes with `done`; when it fails, so does
 * this run. A child its budget stopped stops this run for its budget too.
 */
export const workflowState: StateHandler<"workflow"> = {
  type: "workflow",
  enter: startChild,
  onInput: (context, input) => {
    if (input.type === "child") return childMoved(context, input);
    if (input.type === "send") return refuseSend(context, input);
    return nothing;
  },
};

function startChild({ run, stateId, state, workflows, scope }: StateContext): StateStep {
  const workflowId = state.workflow;
  if (workflowId === undefined) {
    return failed(`Workflow state "${stateId}" names no workflow.`);
  }
  if (!Object.hasOwn(workflows, workflowId)) {
    return failed(
      `Workflow "${workflowId}" isn't among the definitions this run started with, so state "${stateId}" can't start it.`,
    );
  }
  const depth = (run.parent?.depth ?? 0) + 1;
  if (depth > maxChildDepth) {
    return failed(
      `State "${stateId}" would start a child run ${depth} deep; child runs nest at most ${maxChildDepth} deep.`,
    );
  }
  // The visit's `seq` makes the id unique in the run without an id
  // generator, so a start asked for twice finds the same child.
  const childRunId = `${run.runId}.${run.enteredSeq}`;
  return {
    events: [{ type: "workflow.started", state: stateId, workflow: workflowId, childRunId }],
    effects: [
      {
        type: "start-child",
        childRunId,
        state: stateId,
        workflowId,
        input: childInput(state.input, scope),
        depth,
      },
    ],
  };
}

/** Only the child the state waits on counts; news of any other run changes nothing. */
function childMoved({ run, stateId, state }: StateContext, input: ChildInput): StateStep {
  const child = run.child;
  if (child === null || child.state !== stateId || child.runId !== input.childRunId) {
    return nothing;
  }
  if (input.status === "running") {
    return resumeWithChild(run.status === "waiting", stateId, child);
  }
  if (input.status === "waiting") {
    return waitWithChild(run.status === "waiting" ? run.accepts : null, stateId, input);
  }
  const events: DecidedEvent[] = [finished(child, input.status, input)];
  if (input.status === "failed") {
    const error = `Workflow "${child.workflow}" failed: ${input.error}`;
    // Only a budget stop goes up as it is: any other failure of the child
    // is an error of this run's state.
    const reason = input.reason === "budget" ? { reason: input.reason } : {};
    return { events, effects: [], outcome: { type: "fail", error, ...reason } };
  }
  if (input.status === "cant-try") {
    // The child's steps are this run's too: it couldn't try them either.
    return { events, effects: [], outcome: { type: "cant-try", found: input.cantTry } };
  }
  if (state.output !== undefined) {
    events.push({ type: "context.updated", key: state.output, value: input.context });
  }
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}

/** The run waits for what the child waits for; told the same again, it records nothing. */
function waitWithChild(
  accepts: readonly string[] | null,
  stateId: string,
  input: Extract<ChildInput, { status: "waiting" }>,
): StateStep {
  if (accepts !== null && sameEvents(accepts, input.events)) {
    return nothing;
  }
  const waiting: DecidedEvent = {
    type: "run.waiting",
    state: stateId,
    events: [...input.events],
    child: input.childRunId,
  };
  return { events: [waiting], effects: [] };
}

/**
 * The run stops waiting with a child that runs again, and takes no events
 * until the child waits again; told while it runs, it records nothing.
 */
function resumeWithChild(waiting: boolean, stateId: string, child: ChildRun): StateStep {
  if (!waiting) {
    return nothing;
  }
  const resumed: DecidedEvent = {
    type: "workflow.resumed",
    state: stateId,
    childRunId: child.runId,
  };
  return { events: [resumed], effects: [] };
}

function finished(
  child: ChildRun,
  status: "completed" | "failed" | "cant-try",
  input: ChildInput,
): DecidedEvent {
  return {
    type: "workflow.finished",
    state: child.state,
    workflow: child.workflow,
    childRunId: child.runId,
    status,
    ...(input.status === "failed" ? { error: input.error } : {}),
  };
}

function sameEvents(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((event, index) => event === right[index]);
}

/**
 * An event for a run that waits on its child belongs to the child: the
 * executor passes it there, unchanged, before anything is recorded here.
 *
 * @throws InputRefused always
 */
function refuseSend({ run, stateId }: StateContext, input: SendInput): never {
  throw new InputRefused(
    "engine.input-not-accepted",
    `Run "${run.runId}" waits on child run "${run.child?.runId}" in state "${stateId}"; send "${input.event}" to that run.`,
  );
}

function failed(error: string): StateStep {
  return { ...nothing, outcome: { type: "fail", error } };
}
