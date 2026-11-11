// The settings kept where Halonic runs, for every workspace on that
// computer: the assistant and the sandbox default (T11 spec section 6,
// `settings.ai-agent.device-wide`; design on HAL-6159). Studio's host
// sections read and save them here, and see changes the CLI or another
// window made.

import { type HostSettingsStore, type HostSettingValue, isHostSettingKey } from "@halonicjs/ports";

/**
 * One host setting: its key in the store, the value it has when none is
 * saved or the saved one doesn't fit, and the check a value must pass.
 */
export interface HostSetting<T extends HostSettingValue> {
  readonly key: string;
  readonly fallback: T;
  readonly accepts: (value: unknown) => value is T;
}

/**
 * Defines a host setting.
 *
 * @throws RangeError when the key isn't one a store can save, or `accepts` refuses the fallback
 *
 * @example
 * const turnLimit = hostSetting("assistant.turn-limit", 16, (value): value is number =>
 *   Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 64);
 */
export function hostSetting<T extends HostSettingValue>(
  key: string,
  fallback: T,
  accepts: (value: unknown) => value is T,
): HostSetting<T> {
  if (!isHostSettingKey(key)) {
    throw new RangeError(`${JSON.stringify(key)} can't name a host setting.`);
  }
  if (!accepts(fallback)) {
    throw new RangeError(`The fallback for ${key} doesn't pass its own check.`);
  }
  return { key, fallback, accepts };
}

/** Called with the keys whose saved value changed elsewhere: the CLI or another window. */
export type HostSettingsListener = (keys: readonly string[]) => void;

/** How a {@link HostSettings} reports what it can't throw. */
export interface HostSettingsOptions {
  /**
   * Called when a re-read after a change fails, such as while the file is
   * busy; the values from before stay and no listener is called. Studio
   * and the CLI log it. Nothing by default.
   */
  readonly onRefreshError?: (error: unknown) => void;
}

/**
 * The host settings for Studio and the CLI, over a {@link HostSettingsStore}.
 * A saved value that doesn't pass its setting's check reads as the
 * setting's fallback, silently, so a hand-edited file never stops Settings
 * from opening.
 *
 * Saves and re-reads run one at a time, in order, so this object's own
 * saves are never reported as changes. A re-read that fails keeps the
 * values from before, calls no listener and goes to `onRefreshError`; the
 * next change reads again.
 *
 * @example
 * const settings = new HostSettings(store);
 * await settings.load();
 * settings.get(turnLimit); // 16 when none is saved
 * await settings.set(turnLimit, 20);
 * const stop = settings.onChange((keys) => refresh(keys));
 */
export class HostSettings {
  readonly #store: HostSettingsStore;
  readonly #onRefreshError: (error: unknown) => void;
  readonly #listeners = new Set<HostSettingsListener>();
  #values: Readonly<Record<string, HostSettingValue>> = {};
  #loaded = false;
  #queue: Promise<void> = Promise.resolve();
  #refreshQueued = false;
  #stopWatching: (() => void) | undefined;

  constructor(store: HostSettingsStore, options: HostSettingsOptions = {}) {
    this.#store = store;
    this.#onRefreshError = options.onRefreshError ?? (() => undefined);
  }

  /**
   * Reads the saved settings, and from the first load on watches them.
   *
   * @throws the store's error when they can't be read: Studio shows "Couldn't load …"
   */
  async load(): Promise<void> {
    await this.#enqueue(async () => {
      this.#values = await this.#store.read();
      this.#loaded = true;
    });
    this.#stopWatching ??= this.#store.watch(() => this.#refresh());
  }

  /**
   * The setting's value, or its fallback when none is saved or the saved one doesn't fit.
   *
   * @throws Error before {@link HostSettings.load} has succeeded
   */
  get<T extends HostSettingValue>(setting: HostSetting<T>): T {
    if (!this.#loaded) {
      throw new Error("Load the host settings before reading one.");
    }
    const value = this.#values[setting.key];
    return setting.accepts(value) ? value : setting.fallback;
  }

  /**
   * Saves the setting's value. When the save fails, it throws and the value
   * from before stays, so Studio can put the control back and say so.
   *
   * @throws RangeError when the setting's check refuses the value; nothing is saved
   */
  async set<T extends HostSettingValue>(setting: HostSetting<T>, value: T): Promise<void> {
    if (!setting.accepts(value)) {
      throw new RangeError(`That value doesn't fit ${setting.key}; nothing was saved.`);
    }
    // A copy, through JSON as the store keeps it, so the caller's later changes don't reach it.
    const copy = JSON.parse(JSON.stringify(value)) as T;
    await this.#enqueue(async () => {
      await this.#store.set(setting.key, copy);
      this.#values = { ...this.#values, [setting.key]: copy };
    });
  }

  /** Calls `listener` with the keys that changed elsewhere. Returns the stop function. */
  onChange(listener: HostSettingsListener): () => void {
    const call: HostSettingsListener = (keys) => listener(keys);
    this.#listeners.add(call);
    return () => {
      this.#listeners.delete(call);
    };
  }

  /** Stops watching the store. Saved values stay readable. */
  close(): void {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
  }

  #refresh(): void {
    // One re-read waiting is enough: it reads everything that changed before it starts.
    if (this.#refreshQueued) return;
    this.#refreshQueued = true;
    void this.#enqueue(async () => {
      this.#refreshQueued = false;
      const before = this.#values;
      const after = await this.#store.read();
      this.#values = after;
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
        (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      );
      if (keys.length === 0) return;
      for (const listener of [...this.#listeners]) {
        try {
          listener(keys);
        } catch {
          // One failing listener doesn't keep the change from the others.
        }
      }
    }).catch((error: unknown) => {
      try {
        this.#onRefreshError(error);
      } catch {
        // A failing report doesn't make the watch fail.
      }
    });
  }

  #enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.#queue.then(work);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}
