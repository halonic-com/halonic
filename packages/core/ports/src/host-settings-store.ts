/** Version of the {@link HostSettingsStore} port. A breaking change bumps it and comes with an ADR. */
export const hostSettingsStoreVersion = 1;

/** A saved setting's value: anything `JSON.parse` can give back. */
export type HostSettingValue =
  | null
  | boolean
  | number
  | string
  | readonly HostSettingValue[]
  | { readonly [name: string]: HostSettingValue };

/**
 * Every saved setting, by key.
 *
 * @example
 * const values: HostSettingValues = { "assistant.turn-limit": 16, "assistant.connector-tools": true };
 */
export type HostSettingValues = Readonly<Record<string, HostSettingValue>>;

/**
 * The most bytes every saved value may take together, as compact JSON of
 * the values by key (`JSON.stringify(values)` in UTF-8), so long
 * instructions fit and a runaway value doesn't.
 */
export const hostSettingsMaxBytes = 256 * 1024;

/** A key is two or more lowercase words joined by dots, each word letters and digits with single `-`. */
const keyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

/**
 * Whether `key` can name a host setting: at most 64 characters, the section
 * first, such as `assistant.turn-limit` or `sandbox.new-agents`. Adapters
 * refuse any other key, so no key can be `__proto__` or hold a path.
 *
 * @example
 * isHostSettingKey("assistant.turn-limit"); // true
 * isHostSettingKey("turn-limit"); // false: no section
 */
export function isHostSettingKey(key: string): boolean {
  return key.length <= 64 && keyPattern.test(key);
}

/**
 * The settings kept where Halonic runs, for every workspace on that
 * computer: the assistant and the sandbox default (`host`-scoped settings
 * in Studio). They live in the user's profile, `settings/host.json` for the
 * CLI, `serve` and the desktop app, memory for tests and the browser demo,
 * and **never in a workspace file**. A provider key is never one of them,
 * only its secret name.
 *
 * The port only stores JSON values by key. `HostSettings` in `core/app`
 * gives each setting its schema and default, so a value that doesn't fit
 * reads as the default. Saved settings that can't be parsed read as none
 * saved, so every setting starts from its default; the next save writes
 * them afresh. Settings that can't be read at all (no permission, a link)
 * make `read` throw, so Studio can say it couldn't load them.
 */
export interface HostSettingsStore {
  /** Every saved value by key; an empty object when none is saved or they can't be parsed. */
  read(): Promise<HostSettingValues>;
  /**
   * Saves one key's value, or removes the key when `value` is `undefined`,
   * and leaves every other key as it is. A reader sees the settings from
   * before the save or after it, never half of them.
   *
   * @throws RangeError when the key isn't one {@link isHostSettingKey} allows, a
   *   number isn't finite, or the settings would be over {@link hostSettingsMaxBytes};
   *   nothing is saved then
   */
  set(key: string, value: HostSettingValue | undefined): Promise<void>;
  /**
   * Calls `listener` after the saved settings may have changed, by this
   * store or by anything else (another window, the CLI). It may call more
   * than once for one change, and once for several, so the caller reads
   * again and compares. It never calls after the returned stop function.
   */
  watch(listener: () => void): () => void;
}
