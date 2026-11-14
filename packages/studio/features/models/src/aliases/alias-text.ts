/** The words of the alias list and the alias tab (microcopy 6.1; flow-models 2.2 and 2.3). */
export const MODELS_HEADING = "Models";
export const NO_ALIASES_LINE =
  "No model aliases yet. An alias is a short name like `fast` that agents use instead of a provider.";
export const MODELS_UNREADABLE_LINE = "Halonic couldn't read the model aliases.";
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
