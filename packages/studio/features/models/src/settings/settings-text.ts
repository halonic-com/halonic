import { moneyAmount } from "@halonicjs/app";
import type { WorkspaceSettings } from "@halonicjs/format";
import type { ModelsState } from "../aliases/read-models.ts";

/** The words of Settings → Models (flow-settings 1.1; team decision, HAL-10289). */
export const OPEN_MODELS = "Open Models";
export const NO_PROVIDERS_YET = "No providers yet";
/** The line while a part can't be read, rather than a line with that part missing (HAL-11643). */
export const MODELS_UNREADABLE = "Couldn't read the models settings.";

/** "1 alias", "3 aliases". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The budget as it is set, like "budget €50.00 a month"; `undefined` when no amount is set. */
function budgetPart(budget: WorkspaceSettings["budget"], currency: string) {
  const parts = [
    budget?.perRun === undefined ? undefined : `${moneyAmount(budget.perRun, currency)} a run`,
    budget?.monthly === undefined ? undefined : `${moneyAmount(budget.monthly, currency)} a month`,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : `budget ${parts.join(", ")}`;
}

/**
 * The one line of the Models section, "3 aliases · 2 providers · budget €50.00 a month": no
 * providers is "No providers yet"; no budget leaves its part out. While `models.yaml` or the
 * `providers/` folder can't be read it says so, as a line with parts missing would read as fewer
 * aliases or providers. `undefined` while the files are still being read.
 */
export function modelsSummary(state: ModelsState): string | undefined {
  if (state.status === "loading") return undefined;
  if (state.status === "unreadable" || state.providersFailed) return MODELS_UNREADABLE;
  if (state.providers.length === 0) return NO_PROVIDERS_YET;
  return [
    count(Object.keys(state.models.aliases).length, "alias", "aliases"),
    count(state.providers.length, "provider", "providers"),
    budgetPart(state.budget, state.currency),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
