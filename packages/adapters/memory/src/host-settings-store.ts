import {
  changeSavedHostSettings,
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  readSavedHostSettings,
} from "@halonicjs/ports";

/** What two stores for one computer share, as the files in the profile would be. */
interface SharedSettings {
  /** The saved settings' text, as `host.json` holds it; `undefined` when none is saved. */
  text: string | undefined;
  /** The broken copy, as `host.json.broken` holds it. */
  broken: string | undefined;
  readonly listeners: Set<() => void>;
}

/**
 * The settings kept where Halonic runs, in memory, for tests and the
 * browser demo. They are kept as the text a file in the user's profile
 * holds, so every read gives a fresh copy and damaged settings can be
 * modelled. A store made with another one shares its settings, the way two
 * windows on one computer share the profile. A save changes the text in
 * one step, so saves already take turns.
 */
export class MemoryHostSettingsStore implements HostSettingsStore {
  readonly #shared: SharedSettings;

  /** @param sharedWith - another store whose settings this one shares, as a second window would */
  constructor(sharedWith?: MemoryHostSettingsStore) {
    this.#shared =
      sharedWith === undefined
        ? { text: undefined, broken: undefined, listeners: new Set() }
        : sharedWith.#shared;
  }

  async read(): Promise<HostSettingValues> {
    const { text } = this.#shared;
    return (text === undefined ? undefined : readSavedHostSettings(text)) ?? {};
  }

  async set(key: string, value: HostSettingValue): Promise<void> {
    this.#save(key, value);
  }

  async remove(key: string): Promise<void> {
    this.#save(key, undefined);
  }

  watch(listener: () => void): () => void {
    // A wrapper of its own, so one listener watched twice is stopped once each.
    const call = () => listener();
    this.#shared.listeners.add(call);
    return () => {
      this.#shared.listeners.delete(call);
    };
  }

  /** For tests: the saved settings' text, as a file would hold it; `undefined` when none is saved. */
  savedText(): string | undefined {
    return this.#shared.text;
  }

  /** For tests: the broken copy kept before a save over unparsable settings. */
  brokenText(): string | undefined {
    return this.#shared.broken;
  }

  /** For tests: replaces the saved settings' text, as a damaged file or a newer Halonic would. */
  writeText(text: string): void {
    this.#shared.text = text;
    this.#changed();
  }

  #save(key: string, value: HostSettingValue | undefined): void {
    const change = changeSavedHostSettings(this.#shared.text, key, value);
    if (change.broken) this.#shared.broken = this.#shared.text;
    this.#shared.text = change.text;
    this.#changed();
  }

  #changed(): void {
    for (const listener of [...this.#shared.listeners]) listener();
  }
}
