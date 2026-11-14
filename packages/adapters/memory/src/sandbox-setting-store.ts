import { isSandboxSetting, type SandboxSetting, type SandboxSettingStore } from "@halonicjs/ports";

/**
 * The sandbox choice in memory, for tests and the browser demo (requirement
 * `memory.sandbox-setting-store`). The choice is kept as JSON text, the way
 * a file in the user's profile would hold it, so every read gives a fresh
 * copy and a damaged choice can be modelled.
 */
export class MemorySandboxSettingStore implements SandboxSettingStore {
  #text: string | undefined;

  async get(): Promise<SandboxSetting | null> {
    return this.#text === undefined ? null : parseSetting(this.#text);
  }

  async save(setting: SandboxSetting): Promise<void> {
    if (!isSandboxSetting(setting)) throw new Error("The sandbox choice isn't a valid choice.");
    this.#text = JSON.stringify(setting);
  }

  async remove(): Promise<void> {
    this.#text = undefined;
  }

  /**
   * For tests: makes the saved choice unreadable, as a damaged file would
   * be. `get` then throws, and `remove` and `save` still work.
   *
   * @throws when there is no choice, so a test can't create a damaged choice it never saved
   */
  damage(): void {
    if (this.#text === undefined) {
      throw new Error("There is no sandbox choice to damage.");
    }
    this.#text = "{";
  }
}

/** Reads the saved text. Only `save` (which checks the choice) and `damage` write it. */
function parseSetting(text: string): SandboxSetting {
  try {
    return JSON.parse(text) as SandboxSetting;
  } catch (error) {
    throw new Error("The sandbox choice can't be read.", { cause: error });
  }
}
