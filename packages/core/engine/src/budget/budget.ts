// The run and monthly budgets: when one is reached, and the message the run
// ends with. The amounts are in the budget's currency, the one the prices in
// `models.yaml` are written in.

import type { RunFailureCause } from "@halonicjs/events";
import type { WorkspaceSettings } from "@halonicjs/format";

/** The workspace's spending limits, as `workspace.yaml` gives them. */
export type Budget = NonNullable<WorkspaceSettings["budget"]>;

/** What has been spent so far, in the budget's currency. */
export interface Spend {
  /** The whole run: its top-level run and every child run under it. */
  readonly run: number;
  /** Every run that started in the same calendar month (UTC). */
  readonly month: number;
}

/** Why the budget lets no more paid calls happen: the run's error, and the cause its `run.failed` carries. */
export interface BudgetStop {
  /** The message the run ends with, such as `Run budget reached: 5.08 of 5.00 EUR spent.` */
  readonly error: string;
  /**
   * The typed cause for a screen to read instead of `error` (requirement
   * `events.run-failed-cause`): kind `limit_reached`, the code `budget.run`
   * or `budget.month`, and the limit, the spend and the currency in `detail`,
   * unrounded.
   */
  readonly cause: RunFailureCause;
}

/**
 * Why the budget lets no more paid calls happen, or `null` while it allows
 * them. A limit is reached once the spend is at it, so the call that would
 * go past it never starts. The run budget is checked first.
 */
export function budgetStopOf(budget: Budget, spend: Spend): BudgetStop | null {
  if (budget.perRun !== undefined && spend.run >= budget.perRun) {
    return {
      error: runBudgetReached(budget.perRun, spend.run, budget.currency),
      cause: budgetCause("budget.run", budget.perRun, spend.run, budget.currency),
    };
  }
  if (budget.monthly !== undefined && spend.month >= budget.monthly) {
    return {
      error: monthlyBudgetReached(budget.monthly, spend.month, budget.currency),
      cause: budgetCause("budget.month", budget.monthly, spend.month, budget.currency),
    };
  }
  return null;
}

function budgetCause(
  code: "budget.run" | "budget.month",
  limit: number,
  spent: number,
  currency: string,
): RunFailureCause {
  return {
    kind: "limit_reached",
    code,
    detail: { limit: String(limit), spent: String(spent), currency },
  };
}

/** The error of a run its run budget stopped, such as `Run budget reached: 5.08 of 5.00 EUR spent.` */
export function runBudgetReached(limit: number, spent: number, currency: string): string {
  return `Run budget reached: ${amount(spent)} of ${amount(limit)} ${currency} spent.`;
}

/** The error of a run the monthly budget stopped, such as `Monthly budget reached: 50.10 of 50.00 EUR spent this month.` */
export function monthlyBudgetReached(limit: number, spent: number, currency: string): string {
  return `Monthly budget reached: ${amount(spent)} of ${amount(limit)} ${currency} spent this month.`;
}

/**
 * An amount with two decimals, or up to four when a call costs less than a
 * cent, or as many as its first digit needs below 0.0001, so a spend above
 * zero never reads as `0.00`.
 */
function amount(value: number): string {
  // Four decimals, less the last one or two when they are zeros: 5.0800 is 5.08.
  const fourDecimals = value.toFixed(4);
  if (value > 0 && Number(fourDecimals) === 0) {
    return withFirstDigit(value);
  }
  return fourDecimals.replace(/0{1,2}$/, "");
}

/** A positive amount under 0.00005 with decimals up to its first digit: 0.00001 is `0.00001`. */
function withFirstDigit(value: number): string {
  let decimals = 5;
  while (Number(value.toFixed(decimals)) === 0) {
    decimals += 1;
  }
  return value.toFixed(decimals);
}
