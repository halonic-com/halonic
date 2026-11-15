import { defaultCurrency, moneyAmount } from "@halonicjs/app";
import type { WorkspaceSettings } from "@halonicjs/format";
import type { ModelsState } from "../aliases/read-models.ts";

/** The words of Settings → Models (flow-settings 1.1; team decision, HAL-10289). */
export const OPEN_MODELS = "Open Models";
export const NO_PROVIDERS_YET = "No providers yet";

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
 * providers is "No providers yet"; no budget leaves its part out; while `models.yaml` can't be
 * read the aliases are left out, and while the `providers/` folder can't be read the providers
 * are (that isn't "no providers"). `undefined` while the files are still being read, or when
 * nothing is left to say.
 */
export function modelsSummary(state: ModelsState): string | undefined {
  if (state.status === "loading") return undefined;
  if (state.providers.length === 0 && !state.providersFailed) return NO_PROVIDERS_YET;
  const currency =
    state.status === "ready" ? state.currency : (state.budget?.currency ?? defaultCurrency);
  const parts = [
    state.status === "ready"
      ? count(Object.keys(state.models.aliases).length, "alias", "aliases")
      : undefined,
    state.providersFailed ? undefined : count(state.providers.length, "provider", "providers"),
    budgetPart(state.budget, currency),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}
