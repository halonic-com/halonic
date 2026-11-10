import type { SearchProviderContribution, SearchResult } from "../points/commands.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What the search providers found for some words. */
export interface FoundItems {
  /** Every provider's results, in provider order. */
  readonly results: readonly SearchResult[];
  /** Whether a provider failed, so the palette can say it couldn't search everything. */
  readonly failed: boolean;
}

/**
 * Asks every `search.addProvider` provider for the words, each with its own feature's context, and
 * waits for all of them. A provider that fails doesn't hide what the others found. With nothing
 * typed, or no provider yet, nothing is asked and nothing is found.
 *
 * @param contextFor the workspace context for a feature, such as `shell.services.contextFor`
 */
export async function searchProviders(
  words: string,
  providers: readonly Registered<SearchProviderContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): Promise<FoundItems> {
  if (words.trim() === "") {
    return { results: [], failed: false };
  }
  // Started inside a promise, so a provider that throws at once fails like one that rejects.
  const settled = await Promise.allSettled(
    providers.map(async (provider) => provider.search(words, contextFor(provider.featureId))),
  );
  const results: SearchResult[] = [];
  let failed = false;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      failed = true;
    }
  }
  return { results, failed };
}
