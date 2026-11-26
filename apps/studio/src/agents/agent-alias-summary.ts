import { defaultCurrency, moneyAmount } from "@halonicjs/app";
import type { ModelAlias, Provider } from "@halonicjs/format";
import type { AliasCost, AliasSummary } from "@halonicjs/studio-feature-agents/api";
import { filesOf, type LoadedWorkspace, modelAliases } from "@halonicjs/workspace";

/**
 * The alias's provider, model and cost, for the line under the Model page's picker (UX 2.5,
 * microcopy 8.5), with the price in the budget's currency; `undefined` for an alias the hub
 * doesn't have. The provider shows by its name, and by its id only when it has no file.
 */
export function aliasSummaryOf(
  workspace: LoadedWorkspace,
  hubId: string,
  alias: string,
): AliasSummary | undefined {
  const found = modelAliases(workspace, hubId).get(alias);
  if (found === undefined) return undefined;
  const provider = filesOf(workspace, "provider").find(
    (file) => file.value.id === found.provider,
  )?.value;
  const currency = filesOf(workspace, "workspace")[0]?.value.budget?.currency ?? defaultCurrency;
  return {
    provider: provider?.name ?? provider?.id ?? found.provider,
    model: found.model,
    cost: costOf(found.price, provider, currency),
  };
}

/**
 * The test model never costs anything; a price wins over running on this computer, as on the
 * Models list, where a local provider's row says "Runs locally" only while it has no price.
 */
function costOf(
  price: ModelAlias["price"],
  provider: Provider | undefined,
  currency: string,
): AliasCost {
  if (provider?.type === "mock") return { kind: "test-model" };
  if (price !== undefined) {
    return {
      kind: "price",
      input: moneyAmount(price.input, currency),
      output: moneyAmount(price.output, currency),
    };
  }
  return provider?.local === true ? { kind: "on-this-computer" } : { kind: "no-price" };
}
