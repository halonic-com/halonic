import { HostSettings, hostSetting } from "@halonicjs/app";
import type { HostSettingsStore, MessagingId, MessagingSource } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * Which linked account the Inbox and Messenger show, one at a time. The choice is kept where every
 * window of the computer reads it, so a focused Inbox or Messenger window follows a switch made in
 * the main window.
 */
export interface ActiveAccount {
  /** The connection the person last picked, whether or not it is still linked; none before a pick. */
  preferred(): MessagingId | undefined;
  /** Picks the connection to show. Saved, so every window sees it. */
  select(connection: MessagingId): Promise<void>;
  /** Calls `listener` when the pick changes in this window or another. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** The one key an `ActiveAccount` is provided under. */
export const ActiveAccountService: ServiceKey<ActiveAccount> =
  serviceKey<ActiveAccount>("active-account");

const preferredSetting = hostSetting(
  "messaging.active-account",
  "",
  (value): value is string => typeof value === "string",
);

/**
 * The source to show: the picked one while it is still linked, otherwise the first. A connection's
 * ID is its source's ID (`AgentConnection.id`), so this is the only place the two meet.
 */
export function chooseSource(
  sources: readonly MessagingSource[],
  preferred: MessagingId | undefined,
): MessagingId | undefined {
  const picked = sources.find((source) => source.id === preferred);
  return (picked ?? sources[0])?.id;
}

/**
 * An {@link ActiveAccount} kept in the host settings (`messaging.active-account`), which every
 * window reads and watches. Given a store, it loads and closes its own settings; given the
 * window's already loaded {@link HostSettings}, it shares them, so opening another folder reads
 * nothing again and closing one leaves them open.
 *
 * @throws the store's error from `load` when the settings can't be read
 */
export class HostActiveAccount implements ActiveAccount {
  readonly #settings: HostSettings;
  readonly #shared: boolean;
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;

  constructor(source: HostSettingsStore | HostSettings) {
    this.#shared = source instanceof HostSettings;
    this.#settings =
      source instanceof HostSettings
        ? source
        : new HostSettings(source, {
            onRefreshError: (error) => console.error("Reading the active account again", error),
          });
    this.#stopWatching = this.#settings.onChange((keys) => {
      if (keys.includes(preferredSetting.key)) this.#tell();
    });
  }

  /** Reads the saved pick; call once before use. Shared settings were loaded by their owner. */
  async load(): Promise<void> {
    if (!this.#shared) await this.#settings.load();
  }

  preferred(): MessagingId | undefined {
    if (!this.#settings.loaded) return undefined;
    return this.#settings.get(preferredSetting) || undefined;
  }

  async select(connection: MessagingId): Promise<void> {
    await this.#settings.set(preferredSetting, connection);
    this.#tell();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops watching the saved settings; the folder's registry calls it when the folder closes. */
  dispose(): void {
    this.#stopWatching();
    if (!this.#shared) this.#settings.close();
    this.#listeners.clear();
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}
