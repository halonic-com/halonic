import type { AgentResume, RunEvent, RunKind, RunParent, RunStatus } from "@halonicjs/events";
import {
  type BranchEnd,
  branchOfCall,
  endBranch,
  type ParallelBranches,
  startBranch,
} from "./run-branches.ts";

/**
 * The model call a task state waits on: the one its `agent.started` asked
 * for, or the one that goes on after a person answered an approval.
 */
export interface PendingCall {
  /** `call-<n>`, unique in the run. An `effect-done` input names it. */
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  /** What the call asks the agent, so the executor can carry it out from the state alone. */
  readonly prompt: string;
  /** Set when the agent goes on after an approval: where it stopped, and the answer. */
  readonly resume?: ResumeAfterApproval;
}

/** Where an agent stopped for a person's OK, and what the person answered. */
export interface ResumeAfterApproval {
  /** The conversation so far; the call that waited for the OK is `calls[0]`. */
  readonly resume: AgentResume;
  readonly approved: boolean;
  /** What the person wrote with the answer, if anything. */
  readonly comment?: string;
}

/** A tool call waiting for a person's OK, as its `approval.requested` asked. */
export interface WaitingApproval {
  /** `call-<n>`, unique in the run. A `send` that names a call id must name one of these. */
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  readonly tool: string;
  /** The prompt of the model call that stopped for it, for the call that goes on. */
  readonly prompt: string;
  readonly resume: AgentResume;
}

/** The child run a `workflow` state started and waits on: the one its `workflow.started` named. */
export interface ChildRun {
  readonly runId: string;
  readonly state: string;
  readonly workflow: string;
}

/**
 * What the kernel knows about a run: a fold of its events by {@link evolve}.
 * Plain JSON data, so it can be stored as the run's snapshot and thrown away
 * at any time; folding the log again gives the same value.
 */
export interface RunState {
  readonly runId: string;
  readonly hubId: string;
  readonly workflowId: string;
  readonly kind: RunKind;
  readonly definitionsVersion: string;
  readonly input: Record<string, unknown>;
  /** The run and state that started this one, or `null` for a top-level run. */
  readonly parent: RunParent | null;
  readonly status: RunStatus;
  /** The state the run is in, or `null` before the first `state.entered`. */
  readonly state: string | null;
  /** ISO time the current state was entered, for its timers. */
  readonly enteredAt: string | null;
  /**
   * The `seq` of the current state's `state.entered`. A state's timers carry
   * it, so a timer set on an earlier visit to the same state changes nothing.
   */
  readonly enteredSeq: number | null;
  /** The events a waiting run takes, as its last `run.waiting` listed them; empty while it isn't waiting. */
  readonly accepts: readonly string[];
  /** The tool calls waiting for a person's approval, oldest first. */
  readonly approvals: readonly WaitingApproval[];
  /**
   * The values `context.updated` set. The workflow's initial context is not
   * in the log, so `decide` lays these over it.
   */
  readonly context: Record<string, unknown>;
  /** How many call ids the run has handed out; the next one is `call-<calls + 1>`. */
  readonly calls: number;
  readonly pendingCall: PendingCall | null;
  /**
   * The child run the run waits on, from `workflow.started` until its
   * `workflow.finished`. While the child waits, so does the run, and an
   * event sent to the run goes to the child.
   */
  readonly child: ChildRun | null;
  /** The branches of the `parallel` state the run is in, once one has started; `null` in any other state. */
  readonly parallel: ParallelBranches | null;
  /** The `seq` of the last event folded in. The next append expects it. */
  readonly lastSeq: number;
}

/**
 * Fold one event into a run's state. Pure: it never changes `state`, and
 * events that change nothing the kernel reads return the state with only
 * `lastSeq` moved on.
 *
 * @param state - the state so far, or `null` before the run's first event
 * @throws when the first event isn't `run.started`, or a later one is
 */
export function evolve(state: RunState | null, event: RunEvent): RunState {
  if (state === null) {
    return startedState(event);
  }
  if (event.type === "run.started") {
    throw new Error(`Run "${state.runId}" has a second run.started at seq ${event.seq}.`);
  }
  return { ...applyEvent(state, event), lastSeq: event.seq };
}

/**
 * Fold a run's events, oldest first, onto a snapshot or from nothing.
 *
 * @returns the state, or `null` when there is no snapshot and no event
 */
export function foldRun(
  events: readonly RunEvent[],
  snapshot: RunState | null = null,
): RunState | null {
  return events.reduce<RunState | null>(evolve, snapshot);
}

/** The id `decide` gives the next call it asks for. */
export function nextCallId(state: RunState): string {
  return `call-${state.calls + 1}`;
}

/** The model call the run waits on with this id: a task state's, or a `parallel` branch's. */
export function callOf(state: RunState, callId: string): PendingCall | null {
  if (state.pendingCall?.callId === callId) {
    return state.pendingCall;
  }
  return branchOfCall(state.parallel, callId)?.call ?? null;
}

function startedState(event: RunEvent): RunState {
  if (event.type !== "run.started") {
    throw new Error(
      `A run log starts with run.started; run "${event.runId}" starts with ${event.type}.`,
    );
  }
  return {
    runId: event.runId,
    hubId: event.hubId,
    workflowId: event.workflowId,
    kind: event.kind,
    definitionsVersion: event.definitionsVersion,
    input: event.input,
    parent: event.parent ?? null,
    status: "running",
    state: null,
    enteredAt: null,
    enteredSeq: null,
    accepts: [],
    approvals: [],
    context: {},
    calls: 0,
    pendingCall: null,
    child: null,
    parallel: null,
    lastSeq: event.seq,
  };
}

/** What an ended run no longer waits on. */
const ended = {
  pendingCall: null,
  child: null,
  parallel: null,
  accepts: [],
  approvals: [],
} as const;

function applyEvent(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "state.entered":
      return {
        ...state,
        status: "running",
        state: event.state,
        enteredAt: event.at,
        enteredSeq: event.seq,
        accepts: [],
        parallel: null,
      };
    case "agent.started":
      return startCall(state, event);
    case "agent.finished":
      return finishCall(state, event);
    case "context.updated":
      return { ...state, context: { ...state.context, [event.key]: event.value } };
    case "run.waiting":
      return { ...state, status: "waiting", accepts: event.events };
    case "event.received":
    case "timer.fired":
      return { ...state, status: "running", accepts: [] };
    case "workflow.started":
      return {
        ...state,
        child: { runId: event.childRunId, state: event.state, workflow: event.workflow },
      };
    case "workflow.finished":
      return { ...state, status: "running", accepts: [], child: null };
    case "approval.requested":
      return requestApproval(state, event);
    case "approval.resolved":
      return resolveApproval(state, event);
    case "run.completed":
      return { ...state, ...ended, status: "completed", context: event.context };
    case "run.failed":
      return { ...state, ...ended, status: "failed" };
    default:
      return state;
  }
}

/**
 * A state's own agent asks for one model call: the task state's, or one
 * branch's of a `parallel` state. Subagents (`parent` set) run inside their
 * delegating agent's call, so they ask for none of their own.
 */
function startCall(state: RunState, event: Extract<RunEvent, { type: "agent.started" }>): RunState {
  if (event.parent !== undefined) {
    return state;
  }
  const calls = state.calls + 1;
  const { state: stateId, agent, prompt, branch } = event;
  const call: PendingCall = { callId: `call-${calls}`, state: stateId, agent, prompt };
  if (branch !== undefined) {
    return { ...state, calls, parallel: startBranch(state.parallel, branch, call) };
  }
  return { ...state, calls, pendingCall: call };
}

function finishCall(
  state: RunState,
  event: Extract<RunEvent, { type: "agent.finished" }>,
): RunState {
  if (event.parent !== undefined) {
    return state;
  }
  if (event.branch !== undefined) {
    return { ...state, parallel: endBranch(state.parallel, event.branch, branchEndOf(event)) };
  }
  if (state.pendingCall?.state !== event.state) {
    return state;
  }
  return { ...state, pendingCall: null };
}

/** How a branch's `agent.finished` ended it; a failure without a reason counts as `error`. */
function branchEndOf(event: Extract<RunEvent, { type: "agent.finished" }>): BranchEnd {
  if (event.error === undefined) {
    return { output: event.output };
  }
  return { error: event.error, reason: event.reason ?? "error" };
}

/**
 * An agent stopped at a tool call that needs a person's OK. The approval
 * takes a call id of its own, and the model call that stopped is over.
 */
function requestApproval(
  state: RunState,
  event: Extract<RunEvent, { type: "approval.requested" }>,
): RunState {
  const { callId, state: stateId, agent, tool, resume } = event;
  const stopped = state.pendingCall?.state === stateId ? state.pendingCall : null;
  const approval: WaitingApproval = {
    callId,
    state: stateId,
    agent,
    tool,
    prompt: stopped?.prompt ?? "",
    resume,
  };
  return {
    ...state,
    calls: state.calls + 1,
    approvals: [...state.approvals, approval],
    pendingCall: stopped === null ? state.pendingCall : null,
  };
}

/**
 * A person answered an approval. When the run is still in the approval's
 * state, its agent goes on with the answer in a new model call.
 */
function resolveApproval(
  state: RunState,
  event: Extract<RunEvent, { type: "approval.resolved" }>,
): RunState {
  const approval = state.approvals.find((waiting) => waiting.callId === event.callId);
  const approvals = state.approvals.filter((waiting) => waiting.callId !== event.callId);
  if (approval === undefined || approval.state !== state.state) {
    return { ...state, approvals };
  }
  const calls = state.calls + 1;
  const { approved, comment } = event;
  const resume: ResumeAfterApproval = {
    resume: approval.resume,
    approved,
    ...(comment === undefined ? {} : { comment }),
  };
  const { state: stateId, agent, prompt } = approval;
  return {
    ...state,
    approvals,
    calls,
    pendingCall: { callId: `call-${calls}`, state: stateId, agent, prompt, resume },
  };
}
