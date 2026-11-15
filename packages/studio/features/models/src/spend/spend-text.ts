import { moneyAmount } from "@halonicjs/app";

/** The tooltip of the spend item (flow-models 5, microcopy). */
export const SPEND_TOOLTIP =
  "Estimated from the prices in workspace settings › Models. Not a provider invoice. Test runs and chats aren't counted.";

/** What the spend item says, and whether the month's budget is used up. */
export interface MonthLine {
  readonly text: string;
  readonly usedUp: boolean;
}

/**
 * The month line of the status bar: "Est. €3.20 of €50.00 this month", without a monthly budget
 * "Est. €3.20 this month", and " · used up" once the budget is reached.
 */
export function monthLine(spent: number, monthly: number | undefined, currency: string): MonthLine {
  if (monthly === undefined) {
    return { text: `Est. ${moneyAmount(spent, currency)} this month`, usedUp: false };
  }
  const usedUp = spent >= monthly;
  const text = `Est. ${moneyAmount(spent, currency)} of ${moneyAmount(monthly, currency)} this month`;
  return { text: usedUp ? `${text} · used up` : text, usedUp };
}
