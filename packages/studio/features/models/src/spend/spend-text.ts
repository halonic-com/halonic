import { moneyAmount } from "@halonicjs/app";

/** The tooltip of the spend item (flow-models 5, microcopy). */
export const SPEND_TOOLTIP =
  "Estimated from the prices in workspace settings › Models. Not a provider invoice. Test runs and chats aren't counted.";

/** What the spend item says, and whether the month's budget is used up. */
export interface MonthLine {
  readonly text: string;
  readonly usedUp: boolean;
}

/** What the status bar says of the run in view: its cost, and the calls that have no price. */
export interface RunSpend {
  readonly cost: number;
  readonly unpricedCalls: number;
  readonly test: boolean;
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
 * The run's part of the line: "this run €0.15 of €5.00", "this run €0.10 + 2 calls without a
 * price", "this run €0.04 (test run, not counted)". A run whose calls all lack a price names no
 * amount, so it never reads "€0.00".
 */
function runPart(run: RunSpend, perRun: number | undefined, currency: string): string {
  if (run.cost === 0 && run.unpricedCalls > 0) {
    return `this run ${unpricedText(run.unpricedCalls)}`;
  }
  const amount = moneyAmount(run.cost, currency);
  if (run.test) return `this run ${amount} (test run, not counted)`;
  const spent = perRun === undefined ? amount : `${amount} of ${moneyAmount(perRun, currency)}`;
  return run.unpricedCalls > 0
    ? `this run ${spent} + ${unpricedText(run.unpricedCalls)}`
    : `this run ${spent}`;
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
  const text =
    run === undefined
      ? `Est. ${month.text}`
      : `Est. ${runPart(run.spend, run.perRun, currency)} · ${month.text}`;
  return { text, usedUp: month.usedUp };
}
