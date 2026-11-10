// The steps a run reached, read from its run log (cli-output 3.4): which
// state each step was, the agent it ran, and how it ended or where it is
// now. `run-view.ts` turns them into the lines `halonic runs show` prints.

import type { RunEvent, RunSummary } from "@halonicjs/events";

/**
 * How one step the run reached ended, or where it is now. A step that's
 * still open at the end of the log takes the run's own status.
 */
export type StepEnd =
  | { readonly kind: "done"; readonly tookMs: number }
  | { readonly kind: "failed"; readonly tookMs: number }
  | { readonly kind: "answered"; readonly event: string; readonly at: string }
  | { readonly kind: "waitingForYou"; readonly since: string }
  | { readonly kind: "waitingUntil"; readonly due: string }
  | { readonly kind: "waitingForChildRun"; readonly childRunId: string }
  /** An agent step whose tool call waits for the user's OK. */
  | { readonly kind: "waitingForApproval" }
  | { readonly kind: "running"; readonly since: string };

/** One step the run reached, in the order it reached them. */
export interface RunStep {
  readonly stateId: string;
  /** The agent the step ran, not one it handed a task to; `undefined` for a step without one. */
  readonly agentId: string | undefined;
  readonly end: StepEnd;
}

/** A step as it's being read from the log, before its end is known. */
interface OpenStep {
  readonly stateId: string;
  readonly enteredAt: string;
  agentId: string | undefined;
  /**
   * The tool calls the step's agents asked the user's OK for and haven't
   * had it yet, by call id. Parallel branches can each ask at once.
   */
  readonly askingApproval: Set<string>;
  /** The wait step's wait that hasn't been answered yet, from its `run.waiting`. */
  waiting: Extract<RunEvent, { type: "run.waiting" }> | undefined;
  /** The event the user sent to the wait step. */
  answer: { readonly event: string; readonly at: string } | undefined;
}

/**
 * The steps of a run, in order: each `state.entered` of the workflow itself
 * starts one, and the next step, the run's end or its current status ends
 * it. Events of a parallel branch or a for-each item belong to their step
 * and don't start one. The end state the run finished in isn't a step: it
 * does nothing a person sees, so the step `run.completed` names is dropped.
 *
 * @example
 * runSteps(events, summary);
 * // [{ stateId: "read", agentId: "writer", end: { kind: "done", tookMs: 1000 } },
 * //  { stateId: "review", agentId: undefined, end: { kind: "waitingForYou", since: "2026-11-10T14:02:10.000Z" } }]
 */
export function runSteps(events: readonly RunEvent[], summary: RunSummary): RunStep[] {
  const steps: RunStep[] = [];
  let open: OpenStep | undefined;
  for (const event of events) {
    const ending = howTheStepEnds(event);
    if (open !== undefined && ending !== undefined && !isTheEndState(open, event)) {
      steps.push(closed(open, event.at, ending));
    }
    if (ending !== undefined) {
      open = undefined;
    }
    if (startsAStep(event)) {
      open = {
        stateId: event.state,
        enteredAt: event.at,
        agentId: undefined,
        askingApproval: new Set(),
        waiting: undefined,
        answer: undefined,
      };
    } else if (open !== undefined) {
      readInStep(open, event);
    }
  }
  if (open !== undefined) {
    steps.push({ stateId: open.stateId, agentId: open.agentId, end: stillOpen(open, summary) });
  }
  return steps;
}

/** A `state.entered` of the workflow itself, not of a parallel branch or a for-each item. */
function startsAStep(event: RunEvent): event is Extract<RunEvent, { type: "state.entered" }> {
  return event.type === "state.entered" && event.branch === undefined && event.item === undefined;
}

/** How an event ends the step before it: the next step or the run's end; `undefined` when it doesn't. */
function howTheStepEnds(event: RunEvent): "done" | "failed" | undefined {
  if (event.type === "run.failed") {
    return "failed";
  }
  return startsAStep(event) || event.type === "run.completed" ? "done" : undefined;
}

/** Whether the event is the run's completion in the end state `step` entered. */
function isTheEndState(step: OpenStep, event: RunEvent): boolean {
  return event.type === "run.completed" && event.state === step.stateId;
}

/** What an event inside a step says about it: the agent it ran, its approvals, and its wait and answer. */
function readInStep(step: OpenStep, event: RunEvent): void {
  switch (event.type) {
    case "agent.started":
      if (event.parent === undefined && event.state === step.stateId) {
        step.agentId ??= event.agent;
      }
      break;
    case "approval.requested":
      step.askingApproval.add(event.callId);
      break;
    case "approval.resolved":
      step.askingApproval.delete(event.callId);
      break;
    case "run.waiting":
      // An approval's wait belongs to the agent step; only a wait step's is answered.
      if (step.askingApproval.size === 0) {
        step.waiting = event;
      }
      break;
    case "event.received":
      if (step.waiting !== undefined) {
        step.answer = { event: event.event, at: event.at };
        step.waiting = undefined;
      }
      break;
    case "timer.fired":
      step.waiting = undefined;
      break;
  }
}

/** A step that ended at `at`: answered, if the user answered it, else done or failed. */
function closed(step: OpenStep, at: string, how: "done" | "failed"): RunStep {
  const end: StepEnd =
    step.answer !== undefined && how === "done"
      ? { kind: "answered", ...step.answer }
      : { kind: how, tookMs: Date.parse(at) - Date.parse(step.enteredAt) };
  return { stateId: step.stateId, agentId: step.agentId, end };
}

/**
 * Where the last step is when the log hasn't ended it: waiting for the
 * user's OK on a tool call or for their answer, for a child run or a time,
 * or running. The order is the list's (cli-output 3.4, revision 31):
 * approvals, child run, events, then time. Only the last step is open, so
 * every approval the run waits on is its own, even one a parallel branch's
 * inner state asked for.
 */
function stillOpen(step: OpenStep, summary: RunSummary): StepEnd {
  const waiting = step.waiting;
  if (summary.status === "waiting" && summary.approvals.length > 0) {
    return { kind: "waitingForApproval" };
  }
  if (summary.status !== "waiting" || waiting === undefined) {
    return { kind: "running", since: step.enteredAt };
  }
  if (waiting.child !== undefined) {
    return { kind: "waitingForChildRun", childRunId: waiting.child };
  }
  if (waiting.events.length > 0) {
    return { kind: "waitingForYou", since: waiting.at };
  }
  const due = waiting.timers?.[0]?.at;
  return due === undefined
    ? { kind: "running", since: step.enteredAt }
    : { kind: "waitingUntil", due };
}
