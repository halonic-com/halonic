import type { HostSettingsStore, HostSettingValue, HostSettingValues } from "@halonicjs/ports";

/**
 * A `HostSettingsStore` in memory for tests (a studio feature never uses an adapter). `stored` is
 * what is saved; `failSaves` makes the next saves fail, as a locked file would, and `failKeys`
 * makes only the saves of those keys fail.
 */
export class MemoryHostSettingsStore implements HostSettingsStore {
  readonly stored = new Map<string, HostSettingValue>();
  failSaves = false;
  readonly failKeys = new Set<string>();
  readonly #listeners = new Set<() => void>();

  async read(): Promise<HostSettingValues> {
    return Object.fromEntries(this.stored);
  }

  async set(key: string, value: HostSettingValue): Promise<void> {
    if (this.failSaves || this.failKeys.has(key)) throw new Error("The settings file is locked.");
    this.stored.set(key, value);
  }

  async remove(key: string): Promise<void> {
    if (this.failSaves || this.failKeys.has(key)) throw new Error("The settings file is locked.");
    this.stored.delete(key);
  }

  watch(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Changes a value as another window or the CLI would, and tells the watchers. */
  changeElsewhere(key: string, value: HostSettingValue): void {
    this.stored.set(key, value);
    for (const listener of [...this.#listeners]) listener();
  }
}
