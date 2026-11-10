import type { Transition, Workflow, WorkflowState } from "@halonicjs/format";
import { evaluateGuard } from "./guards.ts";
import { parseDuration } from "./parse-duration.ts";

/** What a guard or template can read while a run is in a state. */
export interface Scope {
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  event?: { name: string; payload?: unknown };
}

/** A transition that fires on a timer instead of an event. */
export type TimerTransition = Transition & { after: string };

/** One timer a wait state starts when it is entered. */
export interface StateTimer {
  /** The transition's place in the state's `on` list. */
  index: number;
  /** The delay as written, such as `"30m"`. */
  after: string;
  /** When the timer is due. */
  at: Date;
}

/**
 * Whether the workflow has a state with this id. Inherited names such as
 * `constructor` don't count, because `states` is a plain object.
 */
export function hasState(workflow: Workflow, stateId: string): boolean {
  return Object.hasOwn(workflow.states, stateId);
}

/**
 * The state with this id.
 *
 * @throws when the workflow has no such state
 */
export function getState(workflow: Workflow, stateId: string): WorkflowState {
  const state = hasState(workflow, stateId) ? workflow.states[stateId] : undefined;
  if (!state) {
    throw new Error(`Workflow "${workflow.id}" has no state "${stateId}"`);
  }
  return state;
}

/**
 * The transition an event fires in a state: the first one, in file order,
 * whose event matches and whose guard passes. Timer transitions never fire
 * on an event. `null` when none matches.
 *
 * @example
 * // on: [{ to: answer, when: <category is question> }, { to: review }]
 * selectTransition(workflow, "classify", "done", scope)?.to; // "answer" or "review"
 */
export function selectTransition(
  workflow: Workflow,
  stateId: string,
  event: string,
  scope: Scope,
): Transition | null {
  for (const transition of getState(workflow, stateId).on) {
    if (isTimer(transition) || transition.event !== event) {
      continue;
    }
    if (passes(transition, scope)) {
      return transition;
    }
  }
  return null;
}

/**
 * The events a state accepts, each once, in file order. Timer transitions
 * are left out. A screen shows these as buttons, and `run.waiting` lists them.
 */
export function acceptedEvents(workflow: Workflow, stateId: string): string[] {
  const events = getState(workflow, stateId)
    .on.filter((transition) => !isTimer(transition))
    .map((transition) => transition.event);
  return [...new Set(events)];
}

/**
 * The labels a state's author gave its answers: event → label, the first
 * non-empty label of the event's transitions in file order. Events without
 * one are left out, and so are timer transitions. A screen shows a label on the event's button in
 * place of the event name, and `run.waiting` carries them.
 *
 * @example
 * // on: [{ to: sent, event: approve, label: "Send reply" }, { to: end, event: reject }]
 * answerLabels(workflow, "review"); // { approve: "Send reply" }
 */
export function answerLabels(workflow: Workflow, stateId: string): Record<string, string> {
  // A Map, then fromEntries, so an event named `__proto__` is a key like any other.
  const labels = new Map<string, string>();
  for (const transition of getState(workflow, stateId).on) {
    const label = transition.label?.trim();
    if (isTimer(transition) || !label || labels.has(transition.event)) continue;
    labels.set(transition.event, label);
  }
  return Object.fromEntries(labels);
}

/**
 * The timers a state starts when it is entered at `enteredAt`: one for each
 * transition with `after`, due that long after entering, in file order.
 */
export function stateTimers(workflow: Workflow, stateId: string, enteredAt: Date): StateTimer[] {
  return getState(workflow, stateId).on.flatMap((transition, index) =>
    isTimer(transition)
      ? [
          {
            index,
            after: transition.after,
            at: new Date(enteredAt.getTime() + parseDuration(transition.after)),
          },
        ]
      : [],
  );
}

/**
 * The timer transition to take at `now`: of the timers that are due, the one
 * due first whose guard passes. File order breaks ties. `null` when none is
 * due, or when no due timer's guard passes.
 */
export function dueTimer(
  workflow: Workflow,
  stateId: string,
  enteredAt: Date,
  now: Date,
  scope: Scope,
): TimerTransition | null {
  const transitions = getState(workflow, stateId).on;
  const due = stateTimers(workflow, stateId, enteredAt)
    .filter((timer) => timer.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.index - b.index);
  for (const timer of due) {
    const transition = transitions[timer.index];
    if (transition && isTimer(transition) && passes(transition, scope)) {
      return transition;
    }
  }
  return null;
}

function isTimer(transition: Transition): transition is TimerTransition {
  return transition.after !== undefined;
}

function passes(transition: Transition, scope: Scope): boolean {
  return transition.when === undefined || evaluateGuard(transition.when, scope);
}
