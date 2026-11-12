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
 * reads as the default. The saved settings are `{ "version": 1, "values":
 * {…} }`; the contract suite's golden cases
 * (`packages/testing/contracts/src/golden/host-settings-limits.json`) list
 * the keys, sizes and saved shapes every adapter, the desktop shell's Rust
 * side too, agrees on.
 *
 * - Saved settings that can't be parsed read as none saved, so every
 *   setting starts from its default. The first save over them keeps them
 *   first as a broken copy (`host.json.broken`, replacing an older one),
 *   so they can still be recovered.
 * - A save keeps everything it doesn't change exactly as it is: other
 *   keys, keys `read` leaves out, and the fields and `version` of settings
 *   saved by a newer Halonic.
 * - Saves through one store run one at a time, so two saves of different
 *   keys keep both, and so do two windows of the desktop app, which save
 *   through one process. Between processes (the CLI and the desktop app
 *   saving at the same moment) the last save wins.
 * - Settings that can't be read at all (no permission, a link) make `read`
 *   throw, so Studio can say it couldn't load them.
 */
export interface HostSettingsStore {
  /** Every saved value by key; an empty object when none is saved or they can't be parsed. */
  read(): Promise<HostSettingValues>;
  /**
   * Saves one key's value and leaves every other key as it is. A reader
   * sees the settings from before the save or after it, never half of them.
   *
   * @throws RangeError when the key isn't one {@link isHostSettingKey} allows, a
   *   number isn't finite, or the settings would be over {@link hostSettingsMaxBytes};
   *   nothing is saved then
   */
  set(key: string, value: HostSettingValue): Promise<void>;
  /**
   * Removes one key and leaves every other key as it is. Removing a key
   * that isn't saved is not an error.
   *
   * @throws RangeError when the key isn't one {@link isHostSettingKey} allows; nothing is saved then
   */
  remove(key: string): Promise<void>;
  /**
   * Calls `listener` after the saved settings may have changed, by this
   * store or by anything else (another window, the CLI). It may call more
   * than once for one change, and once for several, so the caller reads
   * again and compares. It never calls after the returned stop function.
   */
  watch(listener: () => void): () => void;
}

/** Saved settings that can be parsed: their values, and every other field as it was saved. */
interface SavedHostSettings {
  readonly [field: string]: unknown;
  readonly values: Readonly<Record<string, unknown>>;
}

/**
 * The values in saved settings' text, leaving out any key
 * {@link isHostSettingKey} refuses; `undefined` when the text can't be
 * parsed as `{ "values": {…} }`. For adapters, which only read and write.
 *
 * @example
 * readSavedHostSettings('{"version":1,"values":{"assistant.turn-limit":20}}'); // { "assistant.turn-limit": 20 }
 * readSavedHostSettings('{"version":1,"values":{'); // undefined
 */
export function readSavedHostSettings(text: string): HostSettingValues | undefined {
  const saved = parseSaved(text);
  if (saved === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(saved.values).filter(([key]) => isHostSettingKey(key)),
  ) as HostSettingValues;
}

/** What an adapter writes for one save, from {@link changeSavedHostSettings}. */
export interface SavedHostSettingsChange {
  /** The settings' new text. */
  readonly text: string;
  /** Whether the old text couldn't be parsed, so the adapter keeps it as a broken copy first. */
  readonly broken: boolean;
}

/**
 * The saved settings' text with one key saved, or removed when `value` is
 * `undefined`, and everything else kept as it is. For adapters, which only
 * read and write.
 *
 * @param text - the saved settings' text, `undefined` when none is saved
 * @throws RangeError when the key isn't one {@link isHostSettingKey} allows, a
 *   number isn't finite, or the values would be over {@link hostSettingsMaxBytes}
 */
export function changeSavedHostSettings(
  text: string | undefined,
  key: string,
  value: HostSettingValue | undefined,
): SavedHostSettingsChange {
  if (!isHostSettingKey(key)) {
    throw new RangeError(`${JSON.stringify(key)} can't name a setting.`);
  }
  if (value !== undefined && !holdsOnlyFiniteNumbers(value)) {
    throw new RangeError(`The value for ${key} has a number that isn't finite.`);
  }
  const saved = text === undefined ? undefined : parseSaved(text);
  const values: Record<string, unknown> = { ...saved?.values };
  if (value === undefined) delete values[key];
  else values[key] = value;
  if (utf8Length(JSON.stringify(values)) > hostSettingsMaxBytes) {
    throw new RangeError(`The settings would be over ${hostSettingsMaxBytes} bytes with ${key}.`);
  }
  return {
    text: `${JSON.stringify({ version: 1, ...saved, values }, null, 2)}\n`,
    broken: text !== undefined && saved === undefined,
  };
}

function parseSaved(text: string): SavedHostSettings | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isObject(parsed) && isObject(parsed["values"]) ? (parsed as SavedHostSettings) : undefined;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `text`'s length in UTF-8 bytes. The core has no `TextEncoder`; JSON text has no lone surrogates. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function holdsOnlyFiniteNumbers(value: HostSettingValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || value === null) return true;
  return Object.values(value).every(holdsOnlyFiniteNumbers);
}
