import type { PluginEntry, PluginInstall } from "@halonicjs/app";
import type {
  InstalledPlugin,
  InstalledPluginFeed,
  InstalledPluginsRead,
} from "@halonicjs/studio-feature-plugins";
import { installedPluginOf } from "./installed-plugin.ts";

/** What {@link PluginFeed} reads: core's `PluginService`, as far as the feed uses it. */
export interface PluginFeedSource {
  load(): Promise<PluginEntry[]>;
  install(id: string): Promise<PluginInstall | null>;
}

/**
 * The installed plugins as the plugins feature's feed. `current` gives the same array until a
 * reload finds something different, as `useSyncExternalStore` needs. A reload that fails keeps the
 * plugins it had and says why, so a failed read never empties Home's cards. `firstRead` says
 * whether any read has worked yet, so Settings can show a skeleton or why it can't list them.
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
  #fingerprints = new Map<string, string>();
  #firstRead: InstalledPluginsRead = { kind: "reading" };
  #reading: Promise<void> | undefined;
  #readAgain: Promise<void> | undefined;

  constructor(source: PluginFeedSource) {
    this.#source = source;
  }

  readonly current = (): readonly InstalledPlugin[] => this.#plugins;

  readonly firstRead = (): InstalledPluginsRead => this.#firstRead;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * The fingerprint of the plugin as the last read found it, which is what the page drew its trust
   * check from. `undefined` for a plugin that can't load or that the feed hasn't read.
   */
  fingerprintOf(plugin: string): string | undefined {
    return this.#fingerprints.get(plugin);
  }

  /**
   * Reads the plugins folder again. A call made while a read runs gets one more read after it,
   * shared with the other calls made meanwhile: the running read may have started before the
   * caller's change, so it can't stand for it.
   *
   * @throws when the plugins folder can't be listed; the feed keeps the plugins it had
   */
  reload(): Promise<void> {
    if (this.#reading === undefined) return this.#start();
    this.#readAgain ??= this.#reading
      .catch(() => {
        // That read's caller gets its error; this call only needs a read that starts now.
      })
      .then(() => {
        this.#readAgain = undefined;
        // A reload() made in the gap after the running read ended has started a read already; a
        // second one beside it could finish first and then be overwritten by the older result.
        return this.#reading ?? this.#start();
      });
    return this.#readAgain;
  }

  #start(): Promise<void> {
    const reading = this.#read().finally(() => {
      if (this.#reading === reading) this.#reading = undefined;
    });
    this.#reading = reading;
    return reading;
  }

  async #read(): Promise<void> {
    let next: readonly InstalledPlugin[];
    try {
      next = await this.#readPlugins();
    } catch (error) {
      // Once a read has worked, the plugins it found stay; only a feed with none says why.
      if (this.#firstRead.kind !== "ready") {
        this.#firstRead = { kind: "failed", error };
        this.#tell();
      }
      throw error;
    }
    const firstToWork = this.#firstRead.kind !== "ready";
    const changed = !sameJson(next, this.#plugins);
    if (changed) this.#plugins = next;
    if (firstToWork) this.#firstRead = { kind: "ready" };
    if (changed || firstToWork) this.#tell();
  }

  async #readPlugins(): Promise<readonly InstalledPlugin[]> {
    const entries = await this.#source.load();
    const next = await Promise.all(
      entries.map(async (entry) =>
        installedPluginOf(
          entry,
          entry.status === "broken" ? null : await this.#source.install(entry.folder),
        ),
      ),
    );
    this.#fingerprints = new Map(
      entries.flatMap((entry) =>
        entry.status === "broken" ? [] : [[entry.folder, entry.fingerprint] as const],
      ),
    );
    return next;
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

/** Whether two reads found the same plugins; the manifests are plain data. */
function sameJson(a: readonly InstalledPlugin[], b: readonly InstalledPlugin[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
