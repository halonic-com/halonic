import { moneyAmount } from "@halonicjs/app";

/** The words of the Budget block (flow-models 2.1; microcopy 6.1). */
export const BUDGET_HEADING = "Budget";
export const CHANGE_BUDGET = "Change";
export const SET_BUDGET = "Set budget";
export const SAVE_BUDGET = "Save";
export const REMOVE_BUDGET = "Remove budget";
export const CANCEL_BUDGET = "Cancel";
export const REMOVED_BUDGET_TITLE = "Removed the budget";
export const UNDO = "Undo";
export const UNDONE_BUDGET_TITLE = "Budget change undone";
export const PER_RUN_ABOVE_MONTHLY = "Per run is higher than per month.";
export const AMOUNT_ABOVE_ZERO = "Enter an amount above 0, like you'd write it on a receipt.";

/** How many providers the block names before it says "+n more". */
const NAMED_PROVIDERS = 3;

/** The title of the toast that says a budget was saved, like "Budget set: €50.00 per month". */
export function budgetSetTitle(summary: string): string {
  return `Budget set: ${summary}`;
}

/** The hint line for providers with no budget: up to three names, then "+n more". */
export function noBudgetLine(names: readonly string[]): string {
  const shown = names.slice(0, NAMED_PROVIDERS).join(", ");
  const more = names.length - NAMED_PROVIDERS;
  if (names.length === 0) return "No budget set";
  return `No budget set for ${shown}${more > 0 ? ` +${more} more` : ""}`;
}

/** The symbol and spoken name a budget field shows before its box, like "€" and "in euros". */
export function currencyAffix(currency: string): { symbol: string; name: string } {
  try {
    const symbol = new Intl.NumberFormat("en", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value;
    const words = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "name",
    })
      .formatToParts(2)
      .find((part) => part.type === "currency")?.value;
    return { symbol: symbol ?? currency, name: `in ${words ?? currency}` };
  } catch {
    return { symbol: currency, name: `in ${currency}` };
  }
}

/** The amounts that are set, like "€5.00 per run · €50.00 per month". */
export function budgetSummary(
  budget: { readonly perRun?: number | undefined; readonly monthly?: number | undefined },
  currency: string,
): string {
  return [
    budget.perRun === undefined ? undefined : `${moneyAmount(budget.perRun, currency)} per run`,
    budget.monthly === undefined ? undefined : `${moneyAmount(budget.monthly, currency)} per month`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
