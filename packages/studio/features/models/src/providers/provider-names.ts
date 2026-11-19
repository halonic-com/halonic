import type { ProviderEntry } from "../aliases/read-models.ts";
import type { ModelsFiles } from "../api.ts";
import { providerTabLabel } from "./provider-text.ts";

/**
 * The provider names read so far, for each open workspace's files. A tab is titled as soon as it
 * opens and can't wait for a read, so the names the Providers list, the pages and the tabs have
 * read are kept here (HAL-12536). A closed workspace's names go with its files.
 */
const namesByFiles = new WeakMap<ModelsFiles, Map<string, string>>();

/** Who wants to hear when a workspace's names change, and how to stop reading them for it. */
interface Listening {
  readonly listeners: Set<() => void>;
  stop: () => void;
}

const listeningByFiles = new WeakMap<ModelsFiles, Listening>();

/**
 * Remembers the name of each provider just read from `files`, so its tab can be titled with it,
 * and tells the listeners when a name changed (HAL-12963).
 */
export function rememberProviderNames(files: ModelsFiles, entries: readonly ProviderEntry[]): void {
  const names = new Map<string, string>();
  for (const { provider } of entries) {
    if (provider.name !== undefined) names.set(provider.id, provider.name);
  }
  const before = namesByFiles.get(files);
  namesByFiles.set(files, names);
  if (before !== undefined && sameNames(before, names)) return;
  for (const listener of [...(listeningByFiles.get(files)?.listeners ?? [])]) listener();
}

/**
 * Calls `listener` each time the names read from `files` change; returns the way to stop. The
 * first listener calls `follow`, which keeps the names read, and the last one stops it.
 */
export function listenToProviderNames(
  files: ModelsFiles,
  listener: () => void,
  follow: () => () => void,
): () => void {
  let listening = listeningByFiles.get(files);
  if (listening === undefined) {
    listening = { listeners: new Set(), stop: () => undefined };
    listeningByFiles.set(files, listening);
    listening.listeners.add(listener);
    listening.stop = follow();
  } else {
    listening.listeners.add(listener);
  }
  const current = listening;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0 || listeningByFiles.get(files) !== current) return;
    listeningByFiles.delete(files);
    current.stop();
  };
}

/**
 * The title of a provider's tab: the name its page shows, or its id with a capital while the
 * provider hasn't been read yet or has no name.
 *
 * @example
 * providerTabTitle(files, "lm-studio"); // "LM Studio" once read, "Lm-studio" before
 */
export function providerTabTitle(files: ModelsFiles | undefined, id: string): string {
  const name = files === undefined ? undefined : namesByFiles.get(files)?.get(id);
  return name ?? providerTabLabel(id);
}

function sameNames(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  return a.size === b.size && [...a].every(([id, name]) => b.get(id) === name);
}
