/** The words of the alias list and the alias tab (microcopy 6.1; flow-models 2.2 and 2.3). */
export const MODELS_HEADING = "Models";
/** The line under "No model aliases yet"; `fast` is shown in code style. */
export const NO_ALIASES_TITLE = "No model aliases yet";
export const NO_ALIASES_BEFORE_EXAMPLE = "An alias is a short name like ";
export const NO_ALIASES_EXAMPLE = "fast";
export const NO_ALIASES_AFTER_EXAMPLE = " that agents use instead of a provider.";
export const MODELS_LOADING_LINE = "Loading models";
export const MODELS_UNREADABLE_TITLE = "Couldn't load models";
export const MODELS_UNREADABLE_REASON = "Halonic couldn't read the model aliases.";
export const TRY_AGAIN = "Try again";
export const NO_PRICE_LINE = "No price";
export const ADD_A_PRICE = "Add a price";
export const ALIAS_KIND_LABEL = "Model alias";
/** The item kind of an alias tab. */
export const ALIAS_KIND = "model-alias";

/** The title of an alias's tab and page. */
export function aliasTitle(name: string): string {
  return `Alias: ${name}`;
}

/** The sentence under the title of an alias's tab. */
export function aliasIntro(name: string): string {
  return `Agents ask for "${name}". Point it at any provider and model; nothing else changes.`;
}

/** The status line after an edit was saved. */
export function aliasUpdatedLine(name: string): string {
  return `Updated model alias ${name}`;
}

/** The hint under "Fallbacks": the order they are tried in, and which aliases can be named. */
export function fallbacksHint(otherAliases: readonly string[]): string {
  const base = "Tried in order when this fails.";
  return otherAliases.length === 0 ? base : `${base} Other aliases: ${otherAliases.join(", ")}`;
}

export const PRICE_HEADING = "Price per million tokens";
export const PRICE_HINT = "Used for the estimated spend and the budget.";
export const CACHE_PRICES_NOTE =
  "Emptying both prices also removes this alias's cache prices. Undo (Ctrl Z) brings them back.";
export const ALIAS_GONE_LINE = "This alias is no longer in models.yaml.";
