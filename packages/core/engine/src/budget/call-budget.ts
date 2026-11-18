// Where a harness call keeps to the run's budget while it runs: before each
// model call its bridge passes on, not only in `step` before the call starts
// (requirement `engine.budget-stops`). A harness run can last an hour and
// make hundreds of model calls, so one check at its start can't bound it.

import type { RunFailureCause } from "@halonicjs/events";
import type { Clock } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { RunState } from "../kernel/run-state.ts";
import { type BudgetStop, budgetStopOf } from "./budget.ts";
import type { BudgetCheck } from "./keep-to-budget.ts";

/**
 * The engine's own error for a harness call the run's budget stopped. The
 * engine records it as the call's failure with the reason `budget`, as
 * `step` does when it stops a run for its budget; `runFailureReasonOf`
 * never sees it.
 */
export class BudgetReachedError extends Error {
  override readonly name = "BudgetReachedError";
  /** The typed cause the call's `run.failed` carries; absent when the refusal gave none. */
  readonly failureCause: RunFailureCause | undefined;

  constructor(message: string, failureCause?: RunFailureCause) {
    super(message);
    this.failureCause = failureCause;
  }
}

/**
 * The `limit_reached` error {@link CallBudget.keep} throws, which also holds
 * the stop, so the engine can log its cause while the bridge answers 429.
 */
export class BudgetStopError extends KindedError {
  readonly stop: BudgetStop;

  constructor(stop: BudgetStop) {
    super("limit_reached", stop.error);
    this.stop = stop;
  }
}

/** What a harness call asks before each model call it makes. */
export interface CallBudget {
  /**
   * Lets the next model call go out, or refuses it once the run or the
   * month has spent its budget. The harness call then stops too.
   *
   * @throws KindedError `limit_reached` when the budget is reached, which the bridge answers with 429
   */
  keep(): Promise<void>;
}

/** The budget of a call that has none to keep to: every model call goes out. */
export const noCallBudget: CallBudget = { keep: async () => {} };

/**
 * The budget of a run's harness call: before each model call, it works out
 * what the run and the month have spent, from the run store's summaries as
 * `step` does, and refuses the call once a limit is reached. The bridge has
 * recorded each earlier call's `llm.response` with its cost by then, so the
 * spend counts every call before this one.
 */
export class RunCallBudget implements CallBudget {
  readonly #check: BudgetCheck;
  readonly #run: RunState;
  readonly #clock: Clock;

  /**
   * @param run - the run the call belongs to, as it was when the call started
   */
  constructor(check: BudgetCheck, run: RunState, clock: Clock) {
    this.#check = check;
    this.#run = run;
    this.#clock = clock;
  }

  async keep(): Promise<void> {
    const budget = await this.#check.budget();
    if (budget === undefined) return;
    const spend = await this.#check.spend(this.#run, this.#clock.now().toISOString());
    const stop = budgetStopOf(budget, spend);
    if (stop !== null) throw new BudgetStopError(stop);
  }
}
