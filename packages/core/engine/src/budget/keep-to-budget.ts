// Where the kernel stops a run for its budget: in `step`, before it stores a
// decision that asks for a paid call. The stop is a `run.failed` with the
// reason `budget` that the kernel writes itself, never an error that
// `runFailureReasonOf` would have to recognise (HAL-1728).

import type { RunEvent } from "@halonicjs/events";
import { tellParent } from "../kernel/decide.ts";
import type { DecidedEvent, Decision, Effect } from "../kernel/decide-types.ts";
import { foldRun, type RunState } from "../kernel/run-state.ts";
import { type Budget, budgetStopOf, type Spend } from "./budget.ts";

/** What `step` reads to keep a run to its budget. */
export interface BudgetCheck {
  /**
   * The workspace's budget as it is now, or `undefined` when it sets none.
   * It is read before every paid call, so a raised budget counts at once.
   */
  budget(): Promise<Budget | undefined>;
  /**
   * What has been spent for the run and in the month of `at`.
   *
   * @param run - the run as it will be once the decision is stored
   */
  spend(run: RunState, at: string): Promise<Spend>;
}

/** The effects that start a call someone pays for: a model call, or a run of a harness. */
const paidCalls: ReadonlySet<Effect["type"]> = new Set(["call-model", "run-harness"]);

/**
 * The decision, or, when it asks for a paid call and a budget is reached,
 * its events followed by the run's `run.failed` with the reason `budget`.
 * The stopped run asks for no call and tells its parent, if it has one.
 *
 * @param run - the run before the decision, `null` for a run that starts
 * @param at - the input's time, which the decided events will carry
 */
export async function keepToBudget(
  check: BudgetCheck,
  runId: string,
  run: RunState | null,
  decision: Decision,
  at: string,
): Promise<Decision> {
  if (!decision.effects.some((effect) => paidCalls.has(effect.type))) {
    return decision;
  }
  const budget = await check.budget();
  if (budget === undefined) {
    return decision;
  }
  const after = foldDecided(runId, run, decision.events, at);
  const error = budgetStopOf(budget, await check.spend(after, at));
  return error === null ? decision : stoppedByBudget(decision, after, error);
}

/** The decision's events and the stop after them, with no effect but telling the parent. */
function stoppedByBudget(decision: Decision, after: RunState, error: string): Decision {
  const failed: DecidedEvent = { type: "run.failed", state: after.state, error, reason: "budget" };
  return {
    events: [...decision.events, failed],
    effects: tellParent({ ...after, status: "failed" }),
  };
}

/** The run as it will be after `events`, numbered and stamped as `step` will store them. */
function foldDecided(
  runId: string,
  run: RunState | null,
  events: readonly DecidedEvent[],
  at: string,
): RunState {
  const lastSeq = run?.lastSeq ?? 0;
  const stamped: RunEvent[] = events.map((event, index) => ({
    ...event,
    runId,
    seq: lastSeq + index + 1,
    at,
  }));
  const after = foldRun(stamped, run);
  if (after === null) {
    throw new Error(`The decision for run "${runId}" asks for a call but records no event.`);
  }
  return after;
}
