import {
  changeSavedHostSettings,
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  readSavedHostSettings,
} from "@halonicjs/ports";

interface Shared {
  text: string | undefined;
  broken: string | undefined;
  readonly listeners: Set<() => void>;
}

/**
 * A small in-memory `HostSettingsStore` for the kernel's own tests. A store
 * made with another shares its settings, as a second window would, and
 * reads or saves can be made to fail. A deliberate fake: core may not use
 * adapters, not even in tests.
 */
export class TestHostSettingsStore implements HostSettingsStore {
  readonly #shared: Shared;
  /** When set, `read` throws it. */
  readError: Error | undefined;
  /** When set, `set` and `remove` throw it and save nothing. */
  saveError: Error | undefined;

  constructor(sharedWith?: TestHostSettingsStore) {
    this.#shared =
      sharedWith === undefined
        ? { text: undefined, broken: undefined, listeners: new Set() }
        : sharedWith.#shared;
  }

  async read(): Promise<HostSettingValues> {
    if (this.readError !== undefined) throw this.readError;
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
    const call = () => listener();
    this.#shared.listeners.add(call);
    return () => {
      this.#shared.listeners.delete(call);
    };
  }

  /** The saved settings' text, as `host.json` would hold it. */
  savedText(): string | undefined {
    return this.#shared.text;
  }

  /** The broken copy, as `host.json.broken` would hold it. */
  brokenText(): string | undefined {
    return this.#shared.broken;
  }

  /** Replaces the saved settings' text, such as with unparsable text, and tells the watchers. */
  writeText(text: string): void {
    this.#shared.text = text;
    this.#changed();
  }

  #save(key: string, value: HostSettingValue | undefined): void {
    if (this.saveError !== undefined) throw this.saveError;
    // Without waiting in between, so saves made together land one after the other.
    const change = changeSavedHostSettings(this.#shared.text, key, value);
    if (change.broken) this.#shared.broken = this.#shared.text;
    this.#shared.text = change.text;
    this.#changed();
  }

  #changed(): void {
    for (const listener of [...this.#shared.listeners]) listener();
  }
}
