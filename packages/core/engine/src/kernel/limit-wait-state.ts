// A run waiting at a plan limit, as the kernel folds it (requirement
// `engine.plan-limit-wait`). The refused decision was never stored, so the
// run is as it was before it; the wait only records what to decide again.

import {
  continueEvent,
  type RunEvent,
  type RunFailureCause,
  type RunStatus,
} from "@halonicjs/events";
import type { RunState } from "./run-state.ts";

/** What a run waiting at a plan limit goes back to on `continue`, and when it stops waiting. */
export interface LimitWait {
  /** The input the engine refused, decided again on `continue`. */
  readonly input: Record<string, unknown>;
  /** How the run was before it waited, which `continue` gives back. */
  readonly was: { readonly status: RunStatus; readonly accepts: readonly string[] };
  readonly cause: RunFailureCause;
  /** When the run fails if nobody continues it (ISO). */
  readonly until: string;
  /** The key of the timer that fails the run at `until`; the first wait's, kept while it waits again. */
  readonly timerKey: string;
}

/** The prefix of a limit wait's timer key; the rest is the `seq` of the first `run.limit-waiting`. */
export const limitTimerPrefix = "limit-wait:";

/**
 * The run starts waiting at a limit, or waits again after a `continue` the
 * meter refused: it then keeps what it was before the first wait and that
 * wait's timer. `waitingAt` is left as it was, so an answer to a wait step
 * decided again still names the step it was meant for.
 */
export function waitAtLimit(
  state: RunState,
  event: Extract<RunEvent, { type: "run.limit-waiting" }>,
): RunState {
  const was = state.limitWait?.was ?? { status: state.status, accepts: state.accepts };
  const timerKey = state.limitWait?.timerKey ?? `${limitTimerPrefix}${event.seq}`;
  const { input, cause, until } = event;
  return {
    ...state,
    status: "waiting",
    accepts: [continueEvent],
    limitWait: { input, was, cause, until, timerKey },
  };
}

/** `continue` was received: the run is as it was before it waited, ready to decide the refused input again. */
export function resumeAfterLimit(state: RunState, wait: LimitWait): RunState {
  return { ...state, status: wait.was.status, accepts: wait.was.accepts, limitWait: null };
}
