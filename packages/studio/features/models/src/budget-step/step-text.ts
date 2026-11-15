import { budgetSummary } from "../budget/budget-text.ts";

/** The words of the Prices and budget step (flow-models 4.2 and 4.3; microcopy 6.1). */
export const SAVE_PRICES = "Save prices";
export const SAVE_BUDGET_STEP = "Save budget";
export const NO_LIMIT = "No limit";
export const NO_LIMIT_LINE = "No limit. Spend is still shown, estimated.";
export const DECIDE_LATER = "Decide later";
export const SAVING = "Saving…";
export const PRICES_HEADING = "Prices per million tokens";
export const PRICES_HINT = "Find these on the provider's pricing page.";
export const CURRENCY_LABEL = "Currency";
export const BUDGET_HEADING_STEP = "Budget";
export const BUDGET_HINT = "Fill in one or both.";
export const PER_RUN_LABEL = "Per run";
export const PER_MONTH_LABEL = "Per month";
export const INPUT_LABEL = "Input";
export const OUTPUT_LABEL = "Output";
export const CHANGE_STEP_BUDGET = "Change";
export const HONEST_LINE =
  "Runs stop at an estimated budget. Costs are estimated from the prices you enter.";
export const HOW_THE_BUDGET_WORKS = "How the budget works";
export const BUDGET_DETAILS = [
  "Halonic checks the budget before each model call, so calls already under way can take a run over it.",
  "Calls without a price don't count towards the budget.",
  "Budgets apply to runs. Chats and the assistant aren't counted yet.",
  "Per run, each child run counts on its own.",
  "Each deployment counts its own month.",
] as const;
export const STEP_NOT_SAVED = "The prices and budget couldn't be saved.";

/** The title of the step: "Prices and budget · Anthropic". */
export function stepTitle(providerName: string): string {
  return `Prices and budget · ${providerName}`;
}

/** The line when no alias uses the provider yet. */
export function noAliasesLine(providerName: string): string {
  return `No aliases use ${providerName} yet. You can add prices on each alias later.`;
}

/** The warning after the currency changes while prices are filled in. */
export function currencyChangedWarning(currency: string): string {
  return `Your prices are read as ${currency} from now on. Check them, Halonic doesn't convert them.`;
}

/** The read-only budget line of the narrowed step, like "Budget: €50.00 per month". */
export function budgetLine(
  budget: { readonly perRun?: number | undefined; readonly monthly?: number | undefined },
  currency: string,
): string {
  return `Budget: ${budgetSummary(budget, currency)}`;
}

/** The undo step's name after the step is saved. */
export function stepSavedLabel(providerName: string): string {
  return `Saved prices and budget for ${providerName}`;
}
