import type { WorkspaceSettings } from "@halonicjs/format";

/**
 * Whether the workspace has a budget: `budget` has `perRun` or `monthly`.
 * A block with only a currency (the Prices and budget step writes one when
 * the currency isn't euros) means no limit, so the Budget block, the step
 * and the status bar all ask here.
 *
 * @example
 * hasBudget({ currency: "EUR", monthly: 50 }); // true
 * hasBudget({ currency: "USD" }); // false
 */
export function hasBudget(budget: WorkspaceSettings["budget"]): boolean {
  return budget?.perRun !== undefined || budget?.monthly !== undefined;
}
