// The month rule of the budget, shared by the engine, which stops a run on it,
// and the Studio, which draws it: a run belongs to the calendar month (UTC) it
// started in, and a month's spend is the sum of its runs' `cost`.

import type { RunSummary } from "@halonicjs/events";

/** What one calendar month (UTC) spent: `month` is `YYYY-MM`. */
export interface MonthSpend {
  readonly month: string;
  readonly spent: number;
}

/** The calendar month (UTC) an ISO time is in, as `YYYY-MM`. */
export function monthOf(time: string): string {
  return time.slice(0, 7);
}

/** The first instant of a `YYYY-MM` month. */
export function monthStartOf(month: string): string {
  return `${month}-01T00:00:00.000Z`;
}

/** The `count` months up to and including the month of `at`, oldest first, as `YYYY-MM`. */
export function lastMonths(at: string, count: number): string[] {
  const last = monthOf(at);
  const index = Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7)) - 1;
  return Array.from({ length: Math.max(0, count) }, (_, back) => {
    const month = index - (count - 1 - back);
    return `${String(Math.floor(month / 12)).padStart(4, "0")}-${String((month % 12) + 1).padStart(2, "0")}`;
  });
}

/**
 * What each of the last `count` calendar months (UTC) up to and including the month of `at`
 * spent, oldest first, from the run summaries (requirement `app.month-spend`). A month without
 * runs spent 0; a run outside the months is left out. Ask the run store only for the runs that
 * started since {@link monthStartOf} the first of {@link lastMonths}.
 */
export function spendByMonth(
  summaries: readonly Pick<RunSummary, "startedAt" | "cost">[],
  at: string,
  count: number,
): MonthSpend[] {
  const months = lastMonths(at, count);
  const totals = new Map(months.map((month) => [month, 0]));
  for (const summary of summaries) {
    const month = monthOf(summary.startedAt);
    const total = totals.get(month);
    if (total !== undefined) totals.set(month, total + summary.cost);
  }
  return months.map((month) => ({ month, spent: totals.get(month) ?? 0 }));
}
