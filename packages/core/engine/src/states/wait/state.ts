import {
  acceptedEvents,
  dueTimer,
  type Scope,
  selectTransition,
  stateTimers,
} from "@halonicjs/workflow";
import type { DecidedEvent, SendInput, TimerInput } from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";

/**
 * The context key an event's payload is written to. The old engine wrote it
 * there, and the recorded logs that parity compares (step 8) have it.
 */
const lastEventKey = "lastEvent";

/**
 * A `wait` state waits for a person. On entry it records `run.waiting` with
 * the events it takes and the due times of its timers, and sets one timer
 * for each. An event sent to it, or the first of its timers that is due,
 * moves the run on. Leaving the state leaves its timers to fire for nothing:
 * each timer names the visit it was set on, so a later visit ignores it.
 */
export const waitState: StateHandler<"wait"> = {
  type: "wait",
  enter: startWaiting,
  onInput: (context, input) => {
    if (input.type === "send") return receiveEvent(context, input);
    if (input.type === "timer") return fireTimer(context, input);
    return nothing;
  },
};

function startWaiting({ run, stateId, workflow }: StateContext): StateStep {
  const timers = stateTimers(workflow, stateId, new Date(run.enteredAt as string));
  const waiting: DecidedEvent = {
    type: "run.waiting",
    state: stateId,
    events: acceptedEvents(workflow, stateId),
    ...(timers.length === 0
      ? {}
      : { timers: timers.map(({ after, at }) => ({ after, at: at.toISOString() })) }),
  };
  return {
    events: [waiting],
    effects: timers.map(({ index, at }) => ({
      type: "set-timer",
      key: timerKey(run.enteredSeq as number, index),
      at: at.toISOString(),
    })),
  };
}

/**
 * The event's payload is written to the context before the guards are
 * checked, so a guard can read it there or as `event.payload`. `decide` has
 * already refused an event the state doesn't list; an event whose guards
 * all fail is refused here, so nothing is recorded for it.
 *
 * @throws InputRefused when no transition for the event has a guard that passes
 */
function receiveEvent(
  { run, stateId, workflow, scope }: StateContext,
  input: SendInput,
): StateStep {
  const { event, payload } = input;
  const context =
    payload === undefined ? scope.context : { ...scope.context, [lastEventKey]: payload };
  const eventScope: Scope = {
    ...scope,
    context,
    event: { name: event, ...(payload === undefined ? {} : { payload }) },
  };
  const transition = selectTransition(workflow, stateId, event, eventScope);
  if (transition === null) {
    throw new InputRefused(
      "engine.input-not-accepted",
      `Run "${run.runId}" takes "${event}" in state "${stateId}", but no transition's condition holds for it.`,
    );
  }
  const events: DecidedEvent[] = [
    { type: "event.received", event, ...(payload === undefined ? {} : { payload }) },
  ];
  if (payload !== undefined) {
    events.push({ type: "context.updated", key: lastEventKey, value: payload });
  }
  return { events, effects: [], outcome: { type: "take", event, to: transition.to } };
}

/**
 * Of the state's timers that are due now, the first whose guard passes moves
 * the run on with the event `after <delay>`. A timer from an earlier visit
 * changes nothing. A timer that arrives before it is due is set again, so
 * a scheduler whose clock runs a little ahead can't leave the run stuck.
 */
function fireTimer(
  { run, stateId, workflow, scope, at }: StateContext,
  input: TimerInput,
): StateStep {
  const timer = parseTimerKey(input.key);
  if (timer === null || timer.enteredSeq !== run.enteredSeq) {
    return nothing;
  }
  const enteredAt = new Date(run.enteredAt as string);
  const now = new Date(at);
  const due = dueTimer(workflow, stateId, enteredAt, now, scope);
  if (due === null) {
    return setAgainIfEarly(stateTimers(workflow, stateId, enteredAt), timer, input.key, now);
  }
  const event = `after ${due.after}`;
  return {
    events: [{ type: "timer.fired", state: stateId, after: due.after }],
    effects: [],
    outcome: { type: "take", event, to: due.to },
  };
}

function setAgainIfEarly(
  timers: ReturnType<typeof stateTimers>,
  timer: TimerOfVisit,
  key: string,
  now: Date,
): StateStep {
  const own = timers.find((candidate) => candidate.index === timer.index);
  if (own === undefined || own.at.getTime() <= now.getTime()) {
    // Due, but its guard doesn't pass: it stays unfired, as the spec says.
    return nothing;
  }
  return { events: [], effects: [{ type: "set-timer", key, at: own.at.toISOString() }] };
}

/** One timer of one visit to a wait state. */
interface TimerOfVisit {
  /** The `seq` of the `state.entered` that started the visit. */
  readonly enteredSeq: number;
  /** The timer transition's place in the state's `on` list. */
  readonly index: number;
}

function timerKey(enteredSeq: number, index: number): string {
  return `${enteredSeq}:${index}`;
}

function parseTimerKey(key: string): TimerOfVisit | null {
  const match = /^(\d+):(\d+)$/.exec(key);
  if (match === null) return null;
  return { enteredSeq: Number(match[1]), index: Number(match[2]) };
}
