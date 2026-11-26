import { harnessModelFit } from "@halonicjs/adapter-workspace-models";
import { defaultCurrency, moneyAmount } from "@halonicjs/app";
import type { ModelAlias, Provider } from "@halonicjs/format";
import type { AgentHarnessId, AliasCost, AliasSummary } from "@halonicjs/studio-feature-agents/api";
import { filesOf, type LoadedWorkspace, modelAliases } from "@halonicjs/workspace";

/**
 * The alias's provider, model and cost, for the line under the Model page's picker (UX 2.5,
 * microcopy 8.5), with the price in the budget's currency; `undefined` for an alias the hub
 * doesn't have. The provider shows by its name, and by its id only when it has no file. It
 * says which harnesses can't call the provider, by the check `halonic run` uses (HAL-18930).
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
    ...(provider === undefined ? {} : { harnessFit: harnessFitOf(provider) }),
  };
}

/** The harnesses that start a program, which calls one API only. */
const programHarnesses: readonly AgentHarnessId[] = ["claude-code", "codex", "opencode"];

/** Each program harness that doesn't simply fit the provider, with why. */
function harnessFitOf(provider: Provider): NonNullable<AliasSummary["harnessFit"]> {
  const fits: Partial<Record<AgentHarnessId, "refused" | "check-endpoint">> = {};
  for (const harness of programHarnesses) {
    const fit = harnessModelFit(harness, provider.type);
    if (fit !== "fits") fits[harness] = fit;
  }
  return fits;
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
