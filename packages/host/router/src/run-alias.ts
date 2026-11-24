import type { ModelAlias } from "@halonicjs/format";
import type { CatalogEntry } from "./catalog.ts";

/**
 * OpenRouter's `provider` routing field for a pinned host: only that host, no
 * fallback to another, and only if it doesn't keep the data for training.
 * The same shape an alias's `params.extra.provider` has (HAL-16834).
 */
export interface PinnedRouting {
  readonly order: string[];
  readonly only: string[];
  readonly allow_fallbacks: false;
  readonly data_collection: "deny";
}

/** The routing that pins an entry to its host, or `undefined` for an alias without one. */
export function pinnedRouting(entry: CatalogEntry): PinnedRouting | undefined {
  if (entry.pinnedHost === undefined) {
    return undefined;
  }
  return {
    order: [entry.pinnedHost],
    only: [entry.pinnedHost],
    allow_fallbacks: false,
    data_collection: "deny",
  };
}

/**
 * The alias an adapter hands to a run when it starts: the catalog's alias,
 * with the pinned host set as `params.extra.provider`. Only the adapter calls
 * this, from the catalog; the agent never sets the host itself.
 *
 * @example
 * const alias = aliasForRun(catalog.entries.get("deepseek-flash"));
 * alias.params.extra?.provider; // { order: ["deepinfra/fp8"], only: ["deepinfra/fp8"], … }
 */
export function aliasForRun(entry: CatalogEntry): ModelAlias {
  const routing = pinnedRouting(entry);
  if (routing === undefined) {
    return entry.alias;
  }
  const params = entry.alias.params;
  return { ...entry.alias, params: { ...params, extra: { ...params.extra, provider: routing } } };
}
