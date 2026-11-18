// The figures of a budget stop, from the engine's cause (requirement
// `engine.budget-stops`) or, in a log written before the engine wrote the
// cause, from its error text (`engine.budget-stop-message`).

import type { RunFailureCause } from "@halonicjs/events";

/** The figures of a budget stop. */
export interface BudgetStop {
  readonly per: "run" | "month";
  readonly currency: string;
  readonly budget: number;
  readonly spent: number;
}

/** Which budget the engine's cause codes name. */
const budgetCodes: Readonly<Record<string, BudgetStop["per"]>> = {
  "budget.run": "run",
  "budget.month": "month",
};

/**
 * The budget stop of a `run.failed` with the reason `budget`: its cause's
 * figures, or else its error text's.
 *
 * @returns `undefined` when neither reads as the engine writes it
 */
export function budgetStopOf(
  cause: RunFailureCause | undefined,
  error: string,
): BudgetStop | undefined {
  return budgetStopOfCause(cause) ?? budgetStopOfError(error);
}

/**
 * The first of the month after `at` (UTC), when a monthly budget starts
 * again, as an ISO date.
 *
 * @example
 * nextMonthStart("2026-12-31T23:59:00.000Z"); // "2027-01-01"
 */
export function nextMonthStart(at: string): string {
  const stopped = new Date(at);
  const next = new Date(Date.UTC(stopped.getUTCFullYear(), stopped.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, "yyyy-mm-dd".length);
}

/** What a `budget.run` or `budget.month` cause says, or `undefined` for any other cause or one that is missing a figure. */
function budgetStopOfCause(cause: RunFailureCause | undefined): BudgetStop | undefined {
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
  return { per, currency, budget, spent: spentAmount };
}

/**
 * The engine's budget stop, at the end of its error, since a parent run wraps
 * its child's: "Run budget reached: 5.08 of 5.00 EUR spent." or "Monthly
 * budget reached: 50.10 of 50.00 EUR spent this month."
 */
const budgetStopText =
  /(Run|Monthly) budget reached: (\d+(?:\.\d+)?) of (\d+(?:\.\d+)?) ([A-Z]{3}) spent(?: this month)?\.$/;

/** The figures of the engine's error text, for a log written before it had the cause. */
function budgetStopOfError(error: string): BudgetStop | undefined {
  const [, per, spent, limit, currency] = budgetStopText.exec(error) ?? [];
  if (per === undefined || spent === undefined || limit === undefined || currency === undefined) {
    return undefined;
  }
  return {
    per: per === "Run" ? "run" : "month",
    currency,
    budget: Number(limit),
    spent: Number(spent),
  };
}
