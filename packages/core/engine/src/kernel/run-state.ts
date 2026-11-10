import type { RunEvent, RunKind, RunParent, RunStatus } from "@halonicjs/events";

/** The model call a task state waits on: the one its `agent.started` asked for. */
export interface PendingCall {
  /** `call-<n>`, unique in the run. An `effect-done` input names it. */
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  /** What the call asks the agent, so the executor can carry it out from the state alone. */
  readonly prompt: string;
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
  /**
   * The call ids of the tool calls waiting for a person's approval, oldest
   * first. A `send` that names a call id must name one of these.
   */
  readonly approvals: readonly string[];
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
    lastSeq: event.seq,
  };
}

/** What an ended run no longer waits on. */
const ended = { pendingCall: null, child: null, accepts: [], approvals: [] } as const;

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
      };
    case "agent.started":
      return startCall(state, event);
    case "agent.finished":
      return finishCall(state, event.state, event.parent);
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
      return { ...state, approvals: [...state.approvals, event.callId] };
    case "approval.resolved":
      return { ...state, approvals: state.approvals.filter((id) => id !== event.callId) };
    case "run.completed":
      return { ...state, ...ended, status: "completed", context: event.context };
    case "run.failed":
      return { ...state, ...ended, status: "failed" };
    default:
      return state;
  }
}

/**
 * A state's own agent asks for one model call. Subagents (`parent` set) run
 * inside their delegating agent's call, so they ask for none of their own.
 */
function startCall(state: RunState, event: Extract<RunEvent, { type: "agent.started" }>): RunState {
  if (event.parent !== undefined) {
    return state;
  }
  const calls = state.calls + 1;
  const { state: stateId, agent, prompt } = event;
  return {
    ...state,
    calls,
    pendingCall: { callId: `call-${calls}`, state: stateId, agent, prompt },
  };
}

function finishCall(state: RunState, stateId: string, parent: string | undefined): RunState {
  if (parent !== undefined || state.pendingCall?.state !== stateId) {
    return state;
  }
  return { ...state, pendingCall: null };
}
