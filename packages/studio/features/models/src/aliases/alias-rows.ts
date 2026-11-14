import type { Models, Provider } from "@halonicjs/format";

/** One alias in the Models list of the workspace page. */
export interface AliasRow {
  readonly name: string;
  /** "default · ollama / llama3.2", as the list shows it. */
  readonly label: string;
}

/**
 * The aliases of `models.yaml`, sorted by name, each with "provider / model".
 *
 * @example
 * aliasRows(models); // [{ name: "default", label: "default · ollama / llama3.2" }]
 */
export function aliasRows(models: Models): AliasRow[] {
  return Object.entries(models.aliases)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([name, alias]) => ({
      name,
      label: `${name} · ${alias.provider} / ${alias.model}`,
    }));
}

/** A provider as the alias editor's provider list shows it: local ones say so. */
export function providerChoiceLabel(provider: Provider): string {
  const name = provider.name ?? provider.id;
  return provider.local ? `${name} (local)` : name;
}
