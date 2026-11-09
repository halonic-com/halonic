import type { RunEvent, RunKind, RunParent, RunStatus } from "@halonicjs/events";

/** The model call a task state waits on: the one its `agent.started` asked for. */
export interface PendingCall {
  /** `call-<n>`, unique in the run. An `effect-done` input names it. */
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
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
   * The values `context.updated` set. The workflow's initial context is not
   * in the log, so `decide` lays these over it.
   */
  readonly context: Record<string, unknown>;
  /** How many call ids the run has handed out; the next one is `call-<calls + 1>`. */
  readonly calls: number;
  readonly pendingCall: PendingCall | null;
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
    context: {},
    calls: 0,
    pendingCall: null,
    lastSeq: event.seq,
  };
}

function applyEvent(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "state.entered":
      return { ...state, status: "running", state: event.state, enteredAt: event.at };
    case "agent.started":
      return startCall(state, event.state, event.agent, event.parent);
    case "agent.finished":
      return finishCall(state, event.state, event.parent);
    case "context.updated":
      return { ...state, context: { ...state.context, [event.key]: event.value } };
    case "run.waiting":
      return { ...state, status: "waiting" };
    case "event.received":
    case "timer.fired":
    case "workflow.finished":
      return { ...state, status: "running" };
    case "run.completed":
      return { ...state, status: "completed", context: event.context, pendingCall: null };
    case "run.failed":
      return { ...state, status: "failed", pendingCall: null };
    default:
      return state;
  }
}

/**
 * A state's own agent asks for one model call. Subagents (`parent` set) run
 * inside their delegating agent's call, so they ask for none of their own.
 */
function startCall(
  state: RunState,
  stateId: string,
  agent: string,
  parent: string | undefined,
): RunState {
  if (parent !== undefined) {
    return state;
  }
  const calls = state.calls + 1;
  return { ...state, calls, pendingCall: { callId: `call-${calls}`, state: stateId, agent } };
}

function finishCall(state: RunState, stateId: string, parent: string | undefined): RunState {
  if (parent !== undefined || state.pendingCall?.state !== stateId) {
    return state;
  }
  return { ...state, pendingCall: null };
}
