import type { ProviderEntry } from "../aliases/read-models.ts";
import type { ModelsFiles } from "../api.ts";
import { providerName } from "./provider-rows.ts";
import { providerTabLabel } from "./provider-text.ts";

/**
 * The provider names read so far, for each open workspace's files. A tab is titled as soon as it
 * opens and can't wait for a read, so the names the Providers list and the pages have read are
 * kept here (HAL-12536). A closed workspace's names go with its files.
 */
const namesByFiles = new WeakMap<ModelsFiles, Map<string, string>>();

/** Remembers the name of each provider just read from `files`, so its tab can be titled with it. */
export function rememberProviderNames(files: ModelsFiles, entries: readonly ProviderEntry[]): void {
  const names = new Map(entries.map(({ provider }) => [provider.id, providerName(provider)]));
  namesByFiles.set(files, names);
}

/**
 * The title of a provider's tab: the name its page shows, or its id with a capital while the
 * provider hasn't been read yet.
 *
 * @example
 * providerTabTitle(files, "mock"); // "Test model" once read, "Mock" before
 */
export function providerTabTitle(files: ModelsFiles | undefined, id: string): string {
  const name = files === undefined ? undefined : namesByFiles.get(files)?.get(id);
  return name ?? providerTabLabel(id);
}
