import type { RunFailureCause } from "./run-basics.ts";

/** The one event a run waiting at a plan limit accepts. */
export const continueEvent = "continue";

/**
 * The run reached a limit of its customer's plan before a paid step, so it
 * waits for `continue` instead of failing (requirement `events.run-limit-waiting`).
 * Nothing of the refused step was logged, so on `continue` the step starts
 * from its beginning. `cause`: the plan's stop, as `run.failed` would have
 * given it, with a `plan.` code. `error`: the stop's words, for a reader that
 * doesn't know the code. `until`: when the run fails with the reason `budget`
 * if nobody continues it (ISO). `input`: the input the engine refused, which
 * it decides again on `continue`; for the engine only, never shown. The event
 * has no cost or token use.
 */
export interface RunLimitWaitingEvent {
  type: "run.limit-waiting";
  state: string | null;
  error: string;
  cause: RunFailureCause;
  until: string;
  input: Record<string, unknown>;
}
