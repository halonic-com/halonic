// One run as the Runs app's list shows it, from any source: a workspace's
// workflow or agent run, or a Paperclip team agent's run (design HAL-18594
// revision 3, section 1). The words here are the design's.

import { moneyAmount } from "@halonicjs/app";
import type { StatusChipTone } from "@halonicjs/studio-kit";
import { fromMinorUnits, type MoneyTotal, type RunCost } from "../costs/cost-totals.ts";
import type { GroupedRun, TodaySummary } from "../list/run-groups.ts";
import { lineSeparator } from "../run-words.ts";

/** One row of the Runs app's list. */
export interface AppRun extends GroupedRun {
  /** What ran: a workflow's name, or an agent's name with its title. */
  readonly title: string;
  /** What it's doing or how it ended, in the Studio's own row words. */
  readonly line: string;
  /** Where it runs: the workspace, or "Paperclip · Acme". */
  readonly where: string;
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
