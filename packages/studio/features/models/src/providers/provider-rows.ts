import type { Provider } from "@halonicjs/format";
import type { ProviderEntry } from "../aliases/read-models.ts";

/** One provider of the Providers list. */
export interface ProviderRow {
  readonly id: string;
  /** "Anthropic · anthropic · cloud": name, type and where it runs. */
  readonly label: string;
}

/** The name a provider goes by: its own name, or its id. */
export function providerName(provider: Provider): string {
  return provider.name ?? provider.id;
}

/** Where the provider runs, as the list and the page say it. */
export function providerPlace(provider: Provider): "local" | "cloud" {
  return provider.local ? "local" : "cloud";
}

/**
 * The providers of `providers/`, sorted by id, each as "name · type · local or cloud".
 *
 * @example
 * providerRows([{ path: "providers/ollama.yaml", provider }]); // [{ id: "ollama", label: "Ollama · ollama · local" }]
 */
export function providerRows(entries: readonly ProviderEntry[]): ProviderRow[] {
  return entries
    .map(({ provider }) => ({
      id: provider.id,
      label: `${providerName(provider)} · ${provider.type} · ${providerPlace(provider)}`,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
