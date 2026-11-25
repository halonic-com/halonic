// A run that reaches a unit's limit of its customer's plan waits for
// `continue` instead of failing (requirement `engine.plan-limit-wait`). The
// refused decision isn't stored, so the run stays as it was before it; the
// wait records the refused input, which `continue` decides again, and sets
// the one timer that fails the run if nobody continues it.

import { continueEvent } from "@halonicjs/events";
import { tellParent } from "../kernel/decide.ts";
import type { DecidedEvent, DecideInput, Decision, TimerInput } from "../kernel/decide-types.ts";
import { type LimitWait, limitTimerPrefix } from "../kernel/limit-wait-state.ts";
import { evolve, type RunState } from "../kernel/run-state.ts";
import { isUnitLimitStop } from "../meter/plan-stops.ts";
import type { BudgetStop } from "./budget.ts";

/** How long a run waits at a plan limit before it fails. */
export const limitWaitDays = 7;

const dayMs = 24 * 60 * 60 * 1000;

/**
 * Whether a stop makes the run wait: a unit's limit, `plan.<unit>` or
 * `plan.member.<unit>`, while a meter is set. Every other stop is final.
 */
export function waitsAt(stop: BudgetStop, metered: boolean): boolean {
  return metered && isUnitLimitStop(stop.cause);
}

/**
 * The decision that makes the run wait at `stop` instead of making the
 * refused decision. A starting run keeps its `run.started` and nothing else
 * of the decision. A run that waits again after a refused `continue` keeps
 * its first wait's input, end and timer.
 *
 * @param run - the run before the refused decision, `null` for a run that starts
 * @param refused - the decision the limit refused
 * @param input - the input that decided it
 * @param fold - folds decided events onto a run, as `step` will store them
 */
export function waitAtLimit(
  run: RunState | null,
  refused: Decision,
  input: DecideInput,
  stop: BudgetStop,
  fold: (run: RunState | null, events: readonly DecidedEvent[]) => RunState,
): Decision {
  const kept = run === null ? refused.events.slice(0, 1) : [];
  const before = run ?? fold(null, kept);
  const wait = before.limitWait;
  const until = wait?.until ?? addDays(input.at, limitWaitDays);
  const { at: _at, ...decided } = input;
  const waiting: DecidedEvent = {
    type: "run.limit-waiting",
    state: before.state,
    error: stop.error,
    cause: stop.cause,
    until,
    input: wait?.input ?? decided,
  };
  if (wait !== null) return { events: [...kept, waiting], effects: [] };
  const key = `${limitTimerPrefix}${before.lastSeq + 1}`;
  return { events: [...kept, waiting], effects: [{ type: "set-timer", key, at: until }] };
}

/**
 * Whether the input continues a run waiting at a plan limit. The run takes
 * `continue` only while it waits there, which `step` has already checked.
 */
export function continuesAtLimit(run: RunState | null, input: DecideInput): run is RunState {
  return (
    input.type === "send" && input.event === continueEvent && run !== null && run.limitWait !== null
  );
}

/**
 * `continue` folded onto the waiting run, and the refused input to decide
 * again from there, with the time of `continue`. Whose plan allows it is the
 * run's own principal's, as for every step: never the sender's.
 */
export function resumedAtLimit(
  run: RunState,
  wait: LimitWait,
  at: string,
): { received: DecidedEvent; resumed: RunState; input: DecideInput } {
  const received: DecidedEvent = { type: "event.received", event: continueEvent };
  const resumed = evolve(run, { ...received, runId: run.runId, seq: run.lastSeq + 1, at });
  // The input is the one `step` refused, as `waitAtLimit` stored it.
  const input = { ...wait.input, at } as unknown as DecideInput;
  return { received, resumed, input };
}

/**
 * The decision for a timer a limit wait set: the run fails with the reason
 * `budget` and the stop's cause when it still waits at that limit. A timer
 * of an earlier wait, delivered late, changes nothing.
 *
 * @returns `null` when the timer isn't a limit wait's
 */
export function limitTimerDecision(run: RunState, input: TimerInput): Decision | null {
  if (!input.key.startsWith(limitTimerPrefix)) return null;
  const wait = run.limitWait;
  if (wait === null || wait.timerKey !== input.key) return { events: [], effects: [] };
  return {
    events: [
      {
        type: "run.failed",
        state: run.state,
        error: `Nobody continued the run within ${limitWaitDays} days of reaching its plan's limit.`,
        reason: "budget",
        cause: wait.cause,
      },
    ],
    effects: tellParent({ ...run, status: "failed" }),
  };
}

function addDays(at: string, days: number): string {
  return new Date(Date.parse(at) + days * dayMs).toISOString();
}
