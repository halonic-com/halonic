// One run as the Runs app's list shows it, from any source: a workspace's
// workflow or agent run, or a Paperclip team agent's run (design HAL-18594
// revision 3, section 1). The words here are the design's.

import { moneyAmount } from "@halonicjs/app";
import { type StatusChipTone, shortTime } from "@halonicjs/studio-kit";
import { fromMinorUnits, type MoneyTotal, type RunCost } from "../costs/cost-totals.ts";
import type { GroupedRun, TodaySummary } from "../list/run-groups.ts";
import { lineSeparator } from "../run-words.ts";

/** Who or what ran, for the row's tile: an agent by its name, or a workflow. */
export type RunBy =
  | {
      readonly kind: "agent";
      readonly name: string;
      /** The agent's ID, for its own colour (`kit.agent-tint`); none when the team doesn't know it. */
      readonly id?: string;
    }
  | { readonly kind: "workflow" };

/** One row of the Runs app's list. */
export interface AppRun extends GroupedRun {
  /** What ran: a workflow's name, or an agent's name with its title. */
  readonly title: string;
  /** What it's doing or how it ended, in the Studio's own row words. */
  readonly line: string;
  /** Where it runs: the workspace, or "Paperclip · Acme". */
  readonly where: string;
  readonly by: RunBy;
  readonly chip: { readonly word: string; readonly tone: StatusChipTone };
  /** The sentence a screen reader hears for the row, ending with a full stop. */
  readonly label: string;
}

/** The Runs app's list words (design revision 3, section 2). */
export const appListWords = {
  title: "Runs",
  running: (count: number) => `${count} running`,
  today: "Today",
  runs: (count: number) => (count === 1 ? "1 run" : `${count} runs`),
  failed: (count: number) => `${count} failed`,
  noRunsToday: "No runs yet today.",
  costs: "Costs",
  soFar: (amount: string) => `${amount} so far`,
  tokens: (count: number) => `${count.toLocaleString("en")} tokens`,
  minutes: (count: number) => `${count} min`,
  hours: (count: number) => `${count} h`,
} as const;

/** One amount of money, in its own currency: "€0.11". */
export function moneyWords(total: MoneyTotal): string {
  return moneyAmount(fromMinorUnits(total.minorUnits, total.currency), total.currency);
}

/**
 * The cost at the end of a row: money in its own currency, or tokens for an
 * agent on a subscription, with "so far" while the run is going. Nothing for
 * a run with no cost reported.
 */
export function rowCostWords(cost: RunCost, running: boolean): string | undefined {
  if (cost.kind === "none") {
    return undefined;
  }
  const words = cost.kind === "money" ? moneyWords(cost) : appListWords.tokens(cost.tokens);
  return running ? appListWords.soFar(words) : words;
}

/** The cost at a row's end in two parts: the amount at full strength, and the muted rest. */
export interface RowCostParts {
  /** Money ("€0.04"), or `undefined` for tokens, which are all muted. */
  readonly amount: string | undefined;
  /** " so far", or the tokens' words. */
  readonly rest: string;
}

/**
 * {@link rowCostWords} split for its tones: money at full strength, "so far" and tokens muted
 * (HAL-18594 rev 3, "Visual pass").
 */
export function rowCostParts(cost: RunCost, running: boolean): RowCostParts | undefined {
  const words = rowCostWords(cost, running);
  if (words === undefined) {
    return undefined;
  }
  if (cost.kind !== "money") {
    return { amount: undefined, rest: words };
  }
  const amount = moneyWords(cost);
  return { amount, rest: words.slice(amount.length) };
}

/**
 * The time at the end of a row's title line: how long it has run while it's going ("7 min",
 * "2 h"), else the time it started on the user's clock, as the kit writes a time in `locale`'s
 * format ("09:00", "9:00 AM"; `runs.app-list-time`). The day is the group's heading.
 */
export function rowTimeWords(
  run: GroupedRun,
  now: Date,
  timeZone: string,
  locale?: string,
): string {
  const started = new Date(run.startedAt);
  if (run.phase === "running" || run.phase === "needs-you") {
    const minutes = Math.max(1, Math.floor((now.getTime() - started.getTime()) / 60_000));
    return minutes < 60
      ? appListWords.minutes(minutes)
      : appListWords.hours(Math.floor(minutes / 60));
  }
  // Read against its own moment, the short time is the time of day: the group already says which day.
  return shortTime(started, started, locale, timeZone);
}

/**
 * The summary line under the heading: "Today: 9 runs · 2 failed · €0.11",
 * one amount per currency, never added together.
 */
export function summaryWords(summary: TodaySummary): string {
  if (summary.runs === 0) {
    return appListWords.noRunsToday;
  }
  const parts = [
    appListWords.runs(summary.runs),
    appListWords.failed(summary.failed),
    ...summary.money.map(moneyWords),
  ];
  return `${appListWords.today}: ${parts.join(lineSeparator)}`;
}
