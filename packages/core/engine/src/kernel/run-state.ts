import type {
  AgentResume,
  CantTryStep,
  RunEvent,
  RunKind,
  RunParent,
  RunStatus,
  RunVersion,
} from "@halonicjs/events";
import {
  type RequestedEffect,
  type ResumeAfterEffect,
  receiveEvent,
  takeEffectRequest,
  takeEffectResult,
} from "./requested-effect.ts";
import {
  type BranchEnd,
  branchOfCall,
  endBranch,
  type ParallelBranches,
  startBranch,
} from "./run-branches.ts";
import { type ForeachItems, finishItem, itemCallOf, startItem } from "./run-items.ts";

/**
 * The model call a task state waits on: the one its `agent.started` asked
 * for, or the one that goes on after a person answered an approval or a
 * connector call that can change things has its result.
 */
export interface PendingCall {
  /** `call-<n>`, unique in the run. An `effect-done` input names it. */
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  /** What the call asks the agent, so the executor can carry it out from the state alone. */
  readonly prompt: string;
  /** Set when the agent goes on after a stop: where it stopped, and the answer. */
  readonly resume?: ResumeAfterStop;
}

/** Where an agent goes on from after it stopped, and what answers the call it stopped at. */
export type ResumeAfterStop = ResumeAfterApproval | ResumeAfterEffect;

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
  /**
   * The harness every task agent of the run runs in, as `run.started` names
   * it, or `null` when each agent runs in the one its file names.
   */
  readonly harness: string | null;
  /**
   * The steps of a Try it or Test run that can't be tried: the ones
   * `run.started` names, then the ones found while running. Empty for any
   * other run.
   */
  readonly cantTry: readonly CantTryStep[];
  /**
   * Which version of the workspace the run read, as `run.started` names
   * it, or `null` when it wasn't recorded, as in older logs.
   */
  readonly version: RunVersion | null;
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
   * The values `context.updated` set, the workflow's initial context first.
   * A log written before the initial context was logged lacks it, so
   * `decide` still lays these over the workflow's.
   */
  readonly context: Record<string, unknown>;
  /** How many call ids the run has handed out; the next one is `call-<calls + 1>`. */
  readonly calls: number;
  readonly pendingCall: PendingCall | null;
  /** The connector call that can change things the run has asked for, with no result yet. */
  readonly effect: RequestedEffect | null;
  /**
   * The child run the run waits on, from `workflow.started` until its
   * `workflow.finished`. While the child waits, so does the run, and an
   * event sent to the run goes to the child.
   */
  readonly child: ChildRun | null;
  /** The branches of the `parallel` state the run is in, once one has started; `null` in any other state. */
  readonly parallel: ParallelBranches | null;
  /** The items of the `foreach` state the run is in, once one has started; `null` in any other state. */
  readonly foreach: ForeachItems | null;
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

/** Whether a run has ended: completed, failed or ended at a step it couldn't try. */
export function hasEnded(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cant-try";
}

/** The model call the run waits on with this id: a task state's, a `parallel` branch's or a `foreach` item's. */
export function callOf(state: RunState, callId: string): PendingCall | null {
  if (state.pendingCall?.callId === callId) {
    return state.pendingCall;
  }
  return branchOfCall(state.parallel, callId)?.call ?? itemCallOf(state.foreach, callId);
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
    harness: event.harness ?? null,
    cantTry: event.cantTry ?? [],
    version: event.version ?? null,
    status: "running",
    state: null,
    enteredAt: null,
    enteredSeq: null,
    accepts: [],
    approvals: [],
    context: {},
    calls: 0,
    pendingCall: null,
    effect: null,
    child: null,
    parallel: null,
    foreach: null,
    lastSeq: event.seq,
  };
}

/** What an ended run no longer waits on. */
const ended = {
  pendingCall: null,
  effect: null,
  child: null,
  parallel: null,
  foreach: null,
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
        foreach: null,
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
      return receiveEvent(state, event.event);
    case "timer.fired":
      return { ...state, status: "running", accepts: [] };
    case "workflow.started":
      return startChild(state, event);
    case "workflow.finished":
      return finishChild(state, event);
    case "approval.requested":
      return requestApproval(state, event);
    case "approval.resolved":
      return resolveApproval(state, event);
    case "effect.requested":
      return takeEffectRequest(state, event);
    case "tool.result":
      return takeEffectResult(state, event);
    case "run.completed":
      return { ...state, ...ended, status: "completed", context: event.context };
    case "run.failed":
      return { ...state, ...ended, status: "failed" };
    case "run.cant-try":
      return { ...state, ...ended, status: "cant-try", cantTry: event.cantTry };
    default:
      return state;
  }
}

/**
 * A state's own agent asks for one model call: the task state's, or one
 * branch's of a `parallel` state, or one item's of a `foreach` state.
 * Subagents (`parent` set) run inside their
 * delegating agent's call, so they ask for none of their own.
 */
function startCall(state: RunState, event: Extract<RunEvent, { type: "agent.started" }>): RunState {
  if (event.parent !== undefined) {
    return state;
  }
  const calls = state.calls + 1;
  const { state: stateId, agent, prompt, branch, item } = event;
  const call: PendingCall = { callId: `call-${calls}`, state: stateId, agent, prompt };
  if (branch !== undefined) {
    return { ...state, calls, parallel: startBranch(state.parallel, branch, call) };
  }
  if (item !== undefined) {
    return { ...state, calls, foreach: startItem(state.foreach, stateId, { item, call }) };
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
    const parallel = endBranch(state.parallel, event.branch, branchEndOf(event));
    const cantTry = event.cantTry === undefined ? state.cantTry : [...state.cantTry, event.cantTry];
    return { ...state, parallel, cantTry };
  }
  if (event.item !== undefined) {
    return {
      ...state,
      foreach: finishItem(state.foreach, event.state, event.item, event.output),
    };
  }
  if (state.pendingCall?.state !== event.state) {
    return state;
  }
  return { ...state, pendingCall: null };
}

/**
 * How a branch's `agent.finished` ended it: a step it couldn't try, or a
 * failure, which counts as `error` without a reason.
 */
function branchEndOf(event: Extract<RunEvent, { type: "agent.finished" }>): BranchEnd {
  if (event.error === undefined) {
    return { output: event.output };
  }
  if (event.cantTry !== undefined) {
    return { error: event.error, cantTry: event.cantTry };
  }
  return { error: event.error, reason: event.reason ?? "error" };
}

/**
 * A `workflow` state's child run, which the run waits on, or one item's of
 * a `foreach` state, which runs alongside the others.
 */
function startChild(
  state: RunState,
  event: Extract<RunEvent, { type: "workflow.started" }>,
): RunState {
  const { childRunId, state: stateId, workflow, item } = event;
  if (item !== undefined) {
    const running = { item, childRunId, workflow };
    return { ...state, foreach: startItem(state.foreach, stateId, running) };
  }
  return { ...state, child: { runId: childRunId, state: stateId, workflow } };
}

function finishChild(
  state: RunState,
  event: Extract<RunEvent, { type: "workflow.finished" }>,
): RunState {
  if (event.item !== undefined) {
    const output = event.context ?? null;
    return { ...state, foreach: finishItem(state.foreach, event.state, event.item, output) };
  }
  return { ...state, status: "running", accepts: [], child: null };
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
