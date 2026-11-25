// Where the kernel stops a run for its budget or its customer's plan: in
// `step`, before it stores a decision that asks for a paid call. The stop is
// a `run.failed` with the reason `budget` that the kernel writes itself, never
// an error that `runFailureReasonOf` would have to recognise (HAL-1728).
// Limits are checked from inner to outer: the run budget, then the meter
// (requirement `engine.meter-checks`), then the monthly budget. A unit's limit
// of the customer's plan makes the run wait for `continue` instead
// (requirement `engine.plan-limit-wait`), unless a final limit is reached too.

import type { RunEvent } from "@halonicjs/events";
import { tellParent } from "../kernel/decide.ts";
import type { DecidedEvent, DecideInput, Decision, Effect } from "../kernel/decide-types.ts";
import { foldRun, type RunState } from "../kernel/run-state.ts";
import { foldableEvent } from "../kernel/saved-artifacts.ts";
import type { MeterCheckKind } from "../meter/meter.ts";
import { isUnitLimitStop } from "../meter/plan-stops.ts";
import type { StepMeter } from "../meter/run-meter.ts";
import { type Budget, type BudgetStop, budgetStopOf, type Spend } from "./budget.ts";
import { waitAtLimit, waitsAt } from "./limit-wait.ts";

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

/** What `step` keeps a run to; without either, nothing stops it. */
export interface RunLimits {
  readonly budget?: BudgetCheck;
  readonly meter?: StepMeter;
}

/**
 * The decision, or, when it asks for a paid call and a limit is reached,
 * its events followed by the run's `run.failed` with the reason `budget`.
 * The stopped run asks for no call and tells its parent, if it has one.
 * A unit's limit of the customer's plan makes the run wait instead, with
 * none of the decision's events.
 *
 * @param run - the run before the decision, `null` for a run that starts
 * @param input - the input that decided it, with the time the decided events will carry
 * @throws when the meter can't be asked; nothing is stored and no call is made
 */
export async function keepToLimits(
  limits: RunLimits,
  runId: string,
  run: RunState | null,
  decision: Decision,
  input: DecideInput,
): Promise<Decision> {
  const kind = paidCallKindOf(decision);
  if (kind === null || (limits.budget === undefined && limits.meter === undefined)) {
    return decision;
  }
  const fold = (from: RunState | null, events: readonly DecidedEvent[]) =>
    foldDecided(runId, from, events, input.at);
  const after = fold(run, decision.events);
  const stop = await firstStop(limits, after, kind, input.at);
  if (stop === null) return decision;
  if (waitsAt(stop, limits.meter !== undefined, after)) {
    return waitAtLimit(run, decision, input, stop, fold);
  }
  return stoppedByBudget(decision, after, stop);
}

/**
 * The first limit reached, from inner to outer: the run budget, the meter,
 * the monthly budget. A final monthly budget comes before a plan's limit
 * the run would wait at, so the run fails rather than waits.
 */
async function firstStop(
  limits: RunLimits,
  after: RunState,
  kind: MeterCheckKind,
  at: string,
): Promise<BudgetStop | null> {
  const budgetStop = await budgetStopFor(limits.budget, after, at);
  if (budgetStop?.cause.code === "budget.run") return budgetStop;
  const planStop = (await limits.meter?.stopOf(after, kind)) ?? null;
  if (planStop !== null && budgetStop !== null && isUnitLimitStop(planStop.cause)) {
    return budgetStop;
  }
  return planStop ?? budgetStop;
}

async function budgetStopFor(
  check: BudgetCheck | undefined,
  after: RunState,
  at: string,
): Promise<BudgetStop | null> {
  const budget = await check?.budget();
  if (check === undefined || budget === undefined) return null;
  return budgetStopOf(budget, await check.spend(after, at));
}

/** What the decision's paid calls are to the meter: a harness run when one is among them. */
function paidCallKindOf(decision: Decision): MeterCheckKind | null {
  const types = decision.effects.map((effect) => effect.type).filter((type) => paidCalls.has(type));
  if (types.length === 0) return null;
  return types.includes("run-harness") ? "harness-run" : "model-call";
}

/** The decision's events and the stop after them, with no effect but telling the parent. */
function stoppedByBudget(decision: Decision, after: RunState, stop: BudgetStop): Decision {
  const failed: DecidedEvent = {
    type: "run.failed",
    state: after.state,
    error: stop.error,
    reason: "budget",
    cause: stop.cause,
  };
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
    ...foldableEvent(event),
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
