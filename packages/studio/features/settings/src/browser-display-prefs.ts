import type { DisplayPrefs } from "./display-prefs.ts";

/** Every display setting's storage key starts with this, so they don't mix with anything else. */
const keyPrefix = "halonic.settings.";

/**
 * The display settings in browser storage, for the Studio served to a browser, per browser and
 * address. Values are kept as JSON. Changes in another window of the same browser come in through
 * the window's `storage` event.
 *
 * @example
 * const prefs = new BrowserDisplayPrefs(window.localStorage, window);
 * const settings = new DisplaySettings(prefs);
 */
export class BrowserDisplayPrefs implements DisplayPrefs {
  private readonly storage: Storage;
  private readonly events: EventTarget;

  /**
   * @param storage where the values are kept, normally `window.localStorage`
   * @param events where the browser fires `storage` events for `storage`, normally `window`
   */
  constructor(storage: Storage, events: EventTarget) {
    this.storage = storage;
    this.events = events;
  }

  read(key: string): unknown {
    try {
      const text = this.storage.getItem(keyPrefix + key);
      return text === null ? undefined : JSON.parse(text);
    } catch {
      // Storage the browser blocks, or text that isn't JSON: the setting starts from its default.
      return undefined;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    this.storage.setItem(keyPrefix + key, JSON.stringify(value));
  }

  subscribe(listener: (key: string) => void): () => void {
    const changed = (event: Event) => {
      const { key, storageArea } = event as StorageEvent;
      if (storageArea === this.storage && key?.startsWith(keyPrefix)) {
        listener(key.slice(keyPrefix.length));
      }
    };
    this.events.addEventListener("storage", changed);
    return () => this.events.removeEventListener("storage", changed);
  }
}
