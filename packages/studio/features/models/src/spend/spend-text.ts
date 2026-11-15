import { moneyAmount } from "@halonicjs/app";

/** The tooltip of the spend item (flow-models 5, microcopy). */
export const SPEND_TOOLTIP =
  "Estimated from the prices in workspace settings › Models. Not a provider invoice. Test runs and chats aren't counted.";

/** What the spend item says, and whether the month's budget is used up. */
export interface MonthLine {
  readonly text: string;
  /**
   * The line in the order a narrow window drops them, last first: the text is `parts.join(" ")`.
   * "Est. this run €0.15" is the first part and the one that stays.
   */
  readonly parts: readonly string[];
  readonly usedUp: boolean;
}

/** What the status bar says of the run in view: its cost with its sub-runs, and the calls that have no price. */
export interface RunSpend {
  readonly cost: number;
  readonly unpricedCalls: number;
}

/** The month's part of the line, "€3.20 of €50.00 this month", with " · used up" once the budget is reached. */
function monthPart(spent: number, monthly: number | undefined, currency: string) {
  if (monthly === undefined) {
    return { text: `${moneyAmount(spent, currency)} this month`, usedUp: false };
  }
  const usedUp = spent >= monthly;
  const text = `${moneyAmount(spent, currency)} of ${moneyAmount(monthly, currency)} this month`;
  return { text: usedUp ? `${text} · used up` : text, usedUp };
}

/** "2 calls without a price", the calls that count towards neither the run's cost nor the budget. */
function unpricedText(calls: number): string {
  return `${calls} ${calls === 1 ? "call" : "calls"} without a price`;
}

/**
 * The run's part of the line, in the parts a narrow window drops from the right: ["this run
 * €0.15", "of €5.00", "+ 2 calls without a price"]. A run whose calls all lack a price names no
 * amount, so it never reads "€0.00".
 */
function runParts(run: RunSpend, perRun: number | undefined, currency: string): string[] {
  if (run.cost === 0 && run.unpricedCalls > 0) {
    return [`this run ${unpricedText(run.unpricedCalls)}`];
  }
  const parts = [`this run ${moneyAmount(run.cost, currency)}`];
  if (perRun !== undefined) parts.push(`of ${moneyAmount(perRun, currency)}`);
  if (run.unpricedCalls > 0) parts.push(`+ ${unpricedText(run.unpricedCalls)}`);
  return parts;
}

/**
 * The status bar line: "Est. €3.20 of €50.00 this month", without a monthly budget
 * "Est. €3.20 this month", and " · used up" once the budget is reached. With a run in view
 * its part comes first: "Est. this run €0.15 of €5.00 · €3.35 of €50.00 this month".
 */
export function monthLine(
  spent: number,
  monthly: number | undefined,
  currency: string,
  run?: { readonly spend: RunSpend; readonly perRun: number | undefined },
): MonthLine {
  const month = monthPart(spent, monthly, currency);
  const [first = "", ...rest] = run === undefined ? [] : runParts(run.spend, run.perRun, currency);
  const parts =
    run === undefined ? [`Est. ${month.text}`] : [`Est. ${first}`, ...rest, `· ${month.text}`];
  return { text: parts.join(" "), parts, usedUp: month.usedUp };
}
