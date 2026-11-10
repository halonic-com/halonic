// The run and monthly budgets: when one is reached, and the message the run
// ends with. The amounts are in the budget's currency, the one the prices in
// `models.yaml` are written in.

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

/**
 * Why the budget lets no more paid calls happen, or `null` while it allows
 * them. A limit is reached once the spend is at it, so the call that would
 * go past it never starts. The run budget is checked first.
 */
export function budgetStopOf(budget: Budget, spend: Spend): string | null {
  if (budget.perRun !== undefined && spend.run >= budget.perRun) {
    return runBudgetReached(budget.perRun, spend.run, budget.currency);
  }
  if (budget.monthly !== undefined && spend.month >= budget.monthly) {
    return monthlyBudgetReached(budget.monthly, spend.month, budget.currency);
  }
  return null;
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
 * cent, so a small spend never reads as `0.00`.
 */
function amount(value: number): string {
  // Four decimals, less the last one or two when they are zeros: 5.0800 is 5.08.
  return value.toFixed(4).replace(/0{1,2}$/, "");
}
