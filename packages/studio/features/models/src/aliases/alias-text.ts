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
/** What a row of a model on this machine says in place of a price: no cost, nothing to add. */
export const RUNS_LOCALLY_LINE = "Runs on this machine";

/** The name of an alias row's "Add a price" button, so a screen reader knows whose price it adds. */
export function addPriceLabel(name: string): string {
  return `${ADD_A_PRICE} for ${name}`;
}
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
export const ALIAS_GONE_LINE = "This model alias isn't in this workspace any more.";
export const ZERO_PRICE_WARNING =
  "A price of 0 means these calls look free in your estimated spend.";
export const GO_TO_MODELS = "Go to Models";
export const STILL_LOADING_LINE = "Still loading";
export const ALIAS_UNREADABLE_TITLE = "Couldn't load this model alias";
/** The workspace page, where the Models section is. */
export const MODELS_PAGE_ITEM = { kind: "workspace", hub: "local", id: "settings" } as const;

/** The line while an alias tab reads `models.yaml`. */
export function aliasLoadingLine(name: string): string {
  return `Loading ${name}`;
}

export const NEW_ALIAS = "New alias";
export const NEW_ALIAS_TITLE = "New model alias";
export const CREATE = "Create";
export const CREATING = "Creating…";
export const NAME_FIELD = "Name";
export const NAME_HINT = "Agents ask for this name, like fast.";
export const PROVIDER_FIELD = "Provider";
export const MODEL_FIELD = "Model";

/** The callout when the new alias couldn't be written. */
export function createFailedLine(reason: string): string {
  return `Couldn't create the model alias: ${reason.replace(/\.$/, "")}. Nothing was changed.`;
}

/** The status line after an alias was added; also the name of its undo step. */
export function aliasAddedLine(name: string): string {
  return `Added model alias ${name}`;
}
