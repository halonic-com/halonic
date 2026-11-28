// The Runs app's list, as groups from most to least urgent (design HAL-18594
// revision 3, section 2): Needs you, Failed (failures not yet opened),
// Running, then one group per day. Pure: the time, the time zone and the
// runs already opened come in, so a test and a laptop give the same answer.

import type { RunStanding } from "@halonicjs/app";
import { dayStart } from "../costs/cost-period.ts";
import { assertWholeUnits, type MoneyTotal, type RunCost } from "../costs/cost-totals.ts";

/**
 * Where a run is, as the groups see it. `stopped` is a run someone stopped,
 * a budget stopped, or Paperclip stopped (reassigned, restarted): it goes to
 * its day, never to Failed, since there is nothing to act on.
 */
export type RunPhase = "needs-you" | "running" | "failed" | "succeeded" | "stopped";

/** One run of any source, as the groups and the summary line need it. */
export interface GroupedRun {
  /** The run's id, unique across sources. */
  readonly id: string;
  readonly phase: RunPhase;
  /** When the run started, or was made while it is queued; ISO 8601. */
  readonly startedAt: string;
  /**
   * What the run belongs to, such as a workflow or a Paperclip task: a later
   * run of the same one that succeeds takes an unopened failure out of Failed.
   */
  readonly lineage: string;
  readonly cost: RunCost;
}

/** One group of the list, under its heading. */
export interface RunGroup<Run extends GroupedRun> {
  /** `needs-you`, `failed`, `running`, or `day` for a day of ended runs. */
  readonly kind: "needs-you" | "failed" | "running" | "day";
  /**
   * "Needs you", "Failed", "Running", "Earlier today", "Yesterday", then "Fri 6 Nov"; in the runs
   * table, "Today" in place of "Earlier today".
   */
  readonly heading: string;
  /** Newest first. */
  readonly runs: readonly Run[];
}

/** What the groups need besides the runs. */
export interface RunGroupsContext {
  /** The runs the user has opened, whose failures have left Failed for their day. */
  readonly opened: ReadonlySet<string>;
  readonly now: Date;
  /** The user's IANA time zone. */
  readonly timeZone: string;
}

/** The headings, in the design's words. */
export const groupWords = {
  needsYou: "Needs you",
  failed: "Failed",
  running: "Running",
  today: "Earlier today",
  /** Today's heading where no Needs you or Running group sits above it, as in the runs table. */
  todayAlone: "Today",
  yesterday: "Yesterday",
} as const;

/** The phase of a workflow run, from the Studio's own standing. */
export function workflowRunPhase(standing: RunStanding): RunPhase {
  switch (standing) {
    case "needs-you":
      return "needs-you";
    case "running":
    case "waiting":
      return "running";
    case "failed":
    case "cant-try":
      return "failed";
    case "budget":
    case "cancelled":
      return "stopped";
    case "done":
      return "succeeded";
  }
}

/**
 * The list's groups, most urgent first, each newest first. An empty group is
 * left out, so with nothing running there is no Running heading.
 *
 * @example
 * runGroups(runs, { opened: new Set(), now, timeZone: "Europe/Madrid" });
 * // [{ kind: "failed", heading: "Failed", runs: […] }, { kind: "day", heading: "Earlier today", … }]
 */
export function runGroups<Run extends GroupedRun>(
  runs: readonly Run[],
  context: RunGroupsContext,
): RunGroup<Run>[] {
  const newestFirst = [...runs].sort((left, right) => startOf(right) - startOf(left));
  const needsYou: Run[] = [];
  const failed: Run[] = [];
  const running: Run[] = [];
  const ended: Run[] = [];
  for (const run of newestFirst) {
    if (run.phase === "needs-you") {
      needsYou.push(run);
    } else if (run.phase === "running") {
      running.push(run);
    } else if (run.phase === "failed" && isUnseenFailure(run, newestFirst, context.opened)) {
      failed.push(run);
    } else {
      ended.push(run);
    }
  }
  const groups: RunGroup<Run>[] = [
    { kind: "needs-you", heading: groupWords.needsYou, runs: needsYou },
    { kind: "failed", heading: groupWords.failed, runs: failed },
    { kind: "running", heading: groupWords.running, runs: running },
    ...dayGroups(ended, context),
  ];
  return groups.filter((group) => group.runs.length > 0);
}

/**
 * Every run, newest first, one group per day it started in the user's zone, whatever its phase:
 * the runs table's groups (`runs.runs-table`). Its first day is "Today", as nothing sits above it.
 */
export function runsByDay<Run extends GroupedRun>(
  runs: readonly Run[],
  context: Omit<RunGroupsContext, "opened">,
): RunGroup<Run>[] {
  const newestFirst = [...runs].sort((left, right) => startOf(right) - startOf(left));
  return dayGroups(newestFirst, { ...context, opened: new Set() }, groupWords.todayAlone);
}

/** A failure nobody has opened, and that no later run of the same lineage has made good. */
function isUnseenFailure(
  run: GroupedRun,
  runs: readonly GroupedRun[],
  opened: ReadonlySet<string>,
): boolean {
  if (opened.has(run.id)) {
    return false;
  }
  return !runs.some(
    (other) =>
      other.lineage === run.lineage && other.phase === "succeeded" && startOf(other) > startOf(run),
  );
}

/** The runs given, one group per day they started in the user's zone, in the order given. */
function dayGroups<Run extends GroupedRun>(
  runs: readonly Run[],
  context: RunGroupsContext,
  todayHeading: string = groupWords.today,
): RunGroup<Run>[] {
  const headingOf = dayHeadings(context, todayHeading);
  const groups: { kind: "day"; heading: string; runs: Run[] }[] = [];
  for (const run of runs) {
    const heading = headingOf(dayStart(new Date(startOf(run)), context.timeZone).getTime());
    const last = groups.at(-1);
    if (last?.heading === heading) {
      last.runs.push(run);
    } else {
      groups.push({ kind: "day", heading, runs: [run] });
    }
  }
  return groups;
}

/**
 * Heads a day by its first instant: `todayHeading` ("Earlier today" or "Today"), "Yesterday",
 * then "Fri 6 Nov", with the year when it isn't this one. The formatters are made once, and each
 * day is worked out once, however many runs it holds.
 */
function dayHeadings(context: RunGroupsContext, todayHeading: string): (day: number) => string {
  const today = dayStart(context.now, context.timeZone).getTime();
  const yesterday = dayStart(new Date(today - 1), context.timeZone).getTime();
  const yearOf = new Intl.DateTimeFormat("en-GB", { timeZone: context.timeZone, year: "numeric" });
  const dateOf = new Intl.DateTimeFormat("en-GB", {
    timeZone: context.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const thisYear = yearOf.format(context.now);
  const known = new Map<number, string>([
    [today, todayHeading],
    [yesterday, groupWords.yesterday],
  ]);
  return (day) => {
    const heading = known.get(day);
    if (heading !== undefined) {
      return heading;
    }
    // A day's start can sit just before midnight UTC, so the date is read at its noon.
    const noon = new Date(day + 12 * 3_600_000);
    const year = yearOf.format(noon);
    const date = dateOf.format(noon);
    const words = year === thisYear ? date : `${date} ${year}`;
    known.set(day, words);
    return words;
  };
}

function startOf(run: GroupedRun): number {
  return Date.parse(run.startedAt);
}

/** The numbers of the list's summary line, for the runs that started today. */
export interface TodaySummary {
  readonly runs: number;
  readonly failed: number;
  /** One total per currency, sorted by code; currencies are never added together. */
  readonly money: readonly MoneyTotal[];
  /** How many runs are running now, whatever day they started: the heading's count. */
  readonly running: number;
}

/**
 * The summary line's numbers: today's runs, how many of them failed, and
 * what they cost, from local midnight in the user's zone, as the Costs view's
 * Today counts.
 *
 * @throws RangeError when a money cost isn't a whole number of minor units
 */
export function todaySummary(
  runs: readonly GroupedRun[],
  context: Omit<RunGroupsContext, "opened">,
): TodaySummary {
  const today = dayStart(context.now, context.timeZone).getTime();
  const todays = runs.filter((run) => startOf(run) >= today);
  const money = new Map<string, number>();
  for (const run of todays) {
    if (run.cost.kind === "money") {
      assertWholeUnits(run.cost.minorUnits, run.cost.currency);
      money.set(run.cost.currency, (money.get(run.cost.currency) ?? 0) + run.cost.minorUnits);
    }
  }
  return {
    runs: todays.length,
    failed: todays.filter((run) => run.phase === "failed").length,
    money: [...money.entries()]
      .map(([currency, minorUnits]) => ({ currency, minorUnits }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    running: runs.filter((run) => run.phase === "running").length,
  };
}
