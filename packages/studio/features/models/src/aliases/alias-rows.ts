import { moneyAmount } from "@halonicjs/app";
import type { ModelAlias, Models, Provider } from "@halonicjs/format";

/** One alias in the Models list of the workspace page. */
export interface AliasRow {
  readonly name: string;
  /** "default · ollama / llama3.2", as the list shows it. */
  readonly label: string;
  /** "€3 in · €15 out per million tokens", or `undefined` when the alias has no price. */
  readonly price: string | undefined;
  /** True when the alias's provider runs on this machine and the alias has no price: it costs nothing to price. */
  readonly runsLocally: boolean;
}

/** What the rows need besides the aliases: the budget currency and the providers that run locally. */
export interface AliasRowContext {
  readonly currency: string;
  readonly localProviders: ReadonlySet<string>;
}

/**
 * The aliases of `models.yaml`, sorted by name, each with "provider / model".
 *
 * @example
 * aliasRows(models, { currency: "EUR", localProviders: new Set(["ollama"]) });
 * // [{ name: "default", label: "default · ollama / llama3.2", price: undefined, runsLocally: true }]
 */
export function aliasRows(
  models: Models,
  { currency, localProviders }: AliasRowContext,
): AliasRow[] {
  return Object.entries(models.aliases)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([name, alias]) => ({
      name,
      label: `${name} · ${alias.provider} / ${alias.model}`,
      price: priceLabel(alias.price, currency),
      runsLocally:
        localProviders.has(alias.provider) && priceLabel(alias.price, currency) === undefined,
    }));
}

function priceLabel(price: ModelAlias["price"], currency: string): string | undefined {
  if (price?.input === undefined || price.output === undefined) return undefined;
  return `${moneyAmount(price.input, currency)} in · ${moneyAmount(price.output, currency)} out per million tokens`;
}

/** A provider as the alias editor's provider list shows it: the test model and local ones say so. */
export function providerChoiceLabel(provider: Provider): string {
  const name = provider.name ?? provider.id;
  if (provider.type === "mock") return `${name} (built-in)`;
  return provider.local ? `${name} (local)` : name;
}

/**
 * The options of an alias's Provider field: every provider of the workspace, local ones marked,
 * sorted by label. The alias's own provider is always there, even when it has no file.
 */
export function providerChoices(
  providers: readonly Provider[],
  current: string,
): { value: string; label: string }[] {
  const choices = providers.map((provider) => ({
    value: provider.id,
    label: providerChoiceLabel(provider),
  }));
  if (!providers.some((provider) => provider.id === current))
    choices.push({ value: current, label: current });
  return choices.sort((first, second) => first.label.localeCompare(second.label));
}
