import { type MonthSpend, spendByMonth } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { MonthBarsProps } from "@halonicjs/studio-kit";
import { spendWords } from "../run-words.ts";

/** How many months Home's Spend tile shows. */
const monthCount = 6;

/** What Home's Spend tile draws, or `undefined` when no run cost anything in the months. */
export type SpendTile = Pick<MonthBarsProps, "months" | "note" | "limit" | "format">;

/**
 * Home's Spend tile (requirement `runs.spend-tile`): what each of the last six months (UTC)
 * spent, by the rule the monthly budget stops on, with the workspace's one current monthly
 * budget on every bar. Without a `monthly` budget there is no budget line and no amber.
 *
 * @param at - the ISO time that sets the current month
 */
export function spendTile(
  summaries: readonly RunSummary[],
  at: string,
  currency: string,
  monthly: number | undefined,
): SpendTile | undefined {
  const spend = spendByMonth(summaries, at, monthCount);
  if (spend.every((month) => month.spent === 0)) return undefined;
  const current = spend.at(-1)?.spent ?? 0;
  const budget = monthly === undefined ? undefined : spendWords.amount(monthly, currency);
  const over = monthly !== undefined && current > monthly;
  const text = noteText(budget, over);
  return {
    months: spend.map((month) => ({
      label: monthName(month),
      value: month.spent,
      ...(monthly === undefined ? {} : { budget: monthly }),
    })),
    format: (value) => spendWords.amount(value, currency),
    note: {
      text,
      ...(over ? { attention: true } : {}),
    },
    ...(monthly === undefined ? {} : { limit: { value: monthly, label: spendWords.budgetLabel } }),
  };
}

/** A month's short English name ("Jun"), for a `YYYY-MM` month. */
function monthName({ month }: MonthSpend): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
}

/** The line under the number: just "This month" without a budget, else within or over it. */
function noteText(budget: string | undefined, over: boolean): string {
  if (budget === undefined) return spendWords.thisMonth;
  return over ? spendWords.overBudget(budget) : spendWords.withinBudget(budget);
}
