import { moneyAmount, monthOf, monthStartOf } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { newestFirst } from "./merge-notices.ts";

/** A run the run budget stopped, as one row of the Inbox's Notices. */
export interface RunBudgetNotice {
  readonly kind: "budget-run";
  /** `budget-run:<run>`. Holds no amount. */
  readonly key: string;
  readonly runId: string;
  readonly hubId: string;
  /** ISO time the run ended. */
  readonly at: string;
  /** "Support replies stopped at its estimated budget · Reached €5.00 per run (estimated €5.08)". */
  readonly title: string;
}

/** The month's budget used up, as one row of the Inbox's Notices. It has **Change budget**, no run. */
export interface MonthBudgetNotice {
  readonly kind: "budget-month";
  /** `budget-month:<YYYY-MM>:<limit>`: a raised budget that runs out again is a new notice. */
  readonly key: string;
  /** ISO time of the newest run that started this month. */
  readonly at: string;
  /** "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget." */
  readonly title: string;
}

/** What the workspace's monthly budget has used. */
export interface MonthBudgetUse {
  readonly limit: number;
  readonly currency: string;
  /** The estimated spend of the runs that started this calendar month (UTC). */
  readonly spent: number;
}

/** What {@link budgetNotices} reads of the workspace. */
export interface BudgetNoticeFacts {
  /** The workspace's monthly budget now and its currency, or `undefined` with no monthly budget. */
  readonly monthly: { readonly limit: number; readonly currency: string } | undefined;
  /** A run's workflow name, for the title. */
  readonly workflowName: (run: RunSummary) => string;
  readonly now: Date;
}

/** The run budget's own error: "Run budget reached: 5.08 of 5.00 EUR spent." */
const runBudgetError =
  /^Run budget reached: (\d+(?:\.\d+)?) of (\d+(?:\.\d+)?) ([A-Za-z]{3}) spent\.$/;

/**
 * The monthly budget's use this month, or `undefined` with no monthly budget. Test runs and runs of
 * another month don't count, as in the engine's own stop (requirement `engine.budget-stops`).
 */
export function monthBudgetUse(
  runs: readonly Pick<RunSummary, "kind" | "startedAt" | "cost">[],
  monthly: { readonly limit: number; readonly currency: string } | undefined,
  now: Date,
): MonthBudgetUse | undefined {
  if (monthly === undefined) return undefined;
  const month = monthOf(now.toISOString());
  const spent = runs
    .filter((run) => run.kind === "run" && monthOf(run.startedAt) === month)
    .reduce((total, run) => total + run.cost, 0);
  return { ...monthly, spent };
}

/** Whether the month's spend is at its budget: the engine's own rule, so the two always agree. */
export function monthBudgetUsedUp(use: MonthBudgetUse | undefined): use is MonthBudgetUse {
  return use !== undefined && use.spent >= use.limit;
}

/** "This month's estimated spend reached its budget of €50.00." (microcopy 10.3, the line a request gets). */
export function monthBudgetReached(use: MonthBudgetUse): string {
  return `This month's estimated spend reached its budget of ${moneyAmount(use.limit, use.currency)}.`;
}

/** The first of next month, "1 December". */
function nextMonthStart(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * The budget notices in these runs (requirement `inbox.budget-notices`): one per top-level run
 * this month that the run budget stopped, and one when the month's spend has reached the monthly
 * budget. Newest first. A run the monthly budget stopped has no row of its own: the month's row says it.
 *
 * @example
 * budgetNotices(summaries, { monthly, workflowName, now: new Date() });
 */
export function budgetNotices(
  runs: readonly RunSummary[],
  facts: BudgetNoticeFacts,
): (RunBudgetNotice | MonthBudgetNotice)[] {
  const { now } = facts;
  const month = monthOf(now.toISOString());
  const notices: (RunBudgetNotice | MonthBudgetNotice)[] = [];
  for (const run of runs) {
    if (run.kind !== "run" || run.parentRunId !== null) continue;
    if (run.status !== "failed" || run.reason !== "budget" || run.endedAt === null) continue;
    if (monthOf(run.endedAt) !== month) continue;
    const stop = runBudgetError.exec(run.error ?? "");
    if (stop === null) continue;
    const [, spent, limit, currency] = stop;
    notices.push({
      kind: "budget-run",
      key: `budget-run:${run.id}`,
      runId: run.id,
      hubId: run.hubId,
      at: run.endedAt,
      title: `${facts.workflowName(run)} stopped at its estimated budget · Reached ${moneyAmount(Number(limit), currency)} per run (estimated ${moneyAmount(Number(spent), currency)}) · ${ago(run.endedAt, now)}`,
    });
  }
  const use = monthBudgetUse(runs, facts.monthly, now);
  if (monthBudgetUsedUp(use)) {
    const newest = runs
      .filter((run) => run.kind === "run" && monthOf(run.startedAt) === month)
      .map((run) => run.startedAt)
      .sort()
      .at(-1);
    notices.push({
      kind: "budget-month",
      key: `budget-month:${month}:${use.limit}`,
      at: newest ?? monthStartOf(month),
      title: `${monthBudgetReached(use)} Runs won't start until ${nextMonthStart(now)} (UTC) or until you change the budget.`,
    });
  }
  return notices.sort(newestFirst);
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago" (microcopy 6.5). */
function ago(at: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, "day")} ago`;
}

function plural(count: number, unit: string): string {
  return count === 1 ? unit : `${unit}s`;
}
