import type { PluginEntry, PluginInstall } from "@halonicjs/app";
import type { InstalledPlugin, InstalledPluginFeed } from "@halonicjs/studio-feature-plugins";
import { installedPluginOf } from "./installed-plugin.ts";

/** What {@link PluginFeed} reads: core's `PluginService`, as far as the feed uses it. */
export interface PluginFeedSource {
  load(): Promise<PluginEntry[]>;
  install(id: string): Promise<PluginInstall | null>;
}

/**
 * The installed plugins as the plugins feature's feed. `current` gives the same array until a
 * reload finds something different, as `useSyncExternalStore` needs. A reload that fails keeps the
 * plugins it had and says why, so a failed read never empties Home's cards.
 *
 * @example
 * const feed = new PluginFeed(service);
 * await feed.reload();
 * feed.current(); // the installed plugins
 */
export class PluginFeed implements InstalledPluginFeed {
  readonly #source: PluginFeedSource;
  readonly #listeners = new Set<() => void>();
  #plugins: readonly InstalledPlugin[] = [];
  #reading: Promise<void> | undefined;

  constructor(source: PluginFeedSource) {
    this.#source = source;
  }

  readonly current = (): readonly InstalledPlugin[] => this.#plugins;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Reads the plugins folder again. Calls made while a read runs share it.
   *
   * @throws when the plugins folder can't be listed; the feed keeps the plugins it had
   */
  reload(): Promise<void> {
    this.#reading ??= this.#read().finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }

  async #read(): Promise<void> {
    const entries = await this.#source.load();
    const next = await Promise.all(
      entries.map(async (entry) =>
        installedPluginOf(
          entry,
          entry.status === "broken" ? null : await this.#source.install(entry.folder),
        ),
      ),
    );
    if (sameJson(next, this.#plugins)) return;
    this.#plugins = next;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** Whether two reads found the same plugins; the manifests are plain data. */
function sameJson(a: readonly InstalledPlugin[], b: readonly InstalledPlugin[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
