// The figures of a budget stop, read from a failed run's typed cause (requirement
// `runs.run-view.failure-banners`, `events.run-failed-cause`). Only `cause` is read: a run without
// one, or with a figure missing, keeps the banner's general budget words.

import type { RunSummary } from "@halonicjs/events";

/** What a `budget.run` or `budget.month` cause says, in the budget's own currency. */
export interface BudgetStop {
  readonly per: "run" | "month";
  /** The limit the run reached, such as 5. */
  readonly budget: number;
  /** What had been spent when it stopped, such as 5.08. */
  readonly spent: number;
  /** The workspace's `budget.currency`, such as "EUR". */
  readonly currency: string;
}

/** Which budget the engine's cause codes name. */
const budgetCodes: Readonly<Record<string, BudgetStop["per"]>> = {
  "budget.run": "run",
  "budget.month": "month",
};

/**
 * The budget, the spend and the currency of the run's cause, or `undefined` for a run without a
 * `budget.run` or `budget.month` cause, or one that is missing a figure.
 *
 * @example
 * budgetStopOf(stoppedRun); // { per: "run", budget: 5, spent: 5.08, currency: "EUR" }
 */
export function budgetStopOf(summary: RunSummary): BudgetStop | undefined {
  const { cause } = summary;
  const per = budgetCodes[cause?.code ?? ""];
  const { limit, spent, currency } = cause?.detail ?? {};
  if (per === undefined || limit === undefined || spent === undefined || currency === undefined) {
    return undefined;
  }
  const budget = Number(limit);
  const spentAmount = Number(spent);
  if (!Number.isFinite(budget) || !Number.isFinite(spentAmount)) {
    return undefined;
  }
  return { per, budget, spent: spentAmount, currency };
}

/** The first of the month after the run stopped (UTC), as "1 January": when a monthly budget starts again. */
export function budgetResetsOn(stoppedAt: string): string {
  const stopped = new Date(stoppedAt);
  const next = new Date(Date.UTC(stopped.getUTCFullYear(), stopped.getUTCMonth() + 1, 1));
  return next.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
