import {
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  hostSettingsMaxBytes,
  isHostSettingKey,
} from "@halonicjs/ports";

/** What two stores for one computer share, as one file in the profile would be. */
interface SharedSettings {
  text: string;
  readonly listeners: Set<() => void>;
}

/**
 * The settings kept where Halonic runs, in memory, for tests and the
 * browser demo. They are kept as JSON text, the way a file in the user's
 * profile holds them, so every read gives a fresh copy and damaged settings
 * can be modelled. A store made with another one shares its settings, the
 * way two windows on one computer share the profile.
 */
export class MemoryHostSettingsStore implements HostSettingsStore {
  readonly #shared: SharedSettings;

  /** @param sharedWith - another store whose settings this one shares, as a second window would */
  constructor(sharedWith?: MemoryHostSettingsStore) {
    this.#shared =
      sharedWith === undefined ? { text: "{}", listeners: new Set() } : sharedWith.#shared;
  }

  async read(): Promise<HostSettingValues> {
    return parseValues(this.#shared.text);
  }

  async set(key: string, value: HostSettingValue | undefined): Promise<void> {
    if (!isHostSettingKey(key)) {
      throw new RangeError(`${JSON.stringify(key)} can't name a setting.`);
    }
    if (value !== undefined && !holdsOnlyFiniteNumbers(value)) {
      throw new RangeError(`The value for ${key} has a number that isn't finite.`);
    }
    const values: Record<string, HostSettingValue> = { ...parseValues(this.#shared.text) };
    if (value === undefined) delete values[key];
    else values[key] = value;
    const text = JSON.stringify(values);
    if (new TextEncoder().encode(text).byteLength > hostSettingsMaxBytes) {
      throw new RangeError(`The settings would be over ${hostSettingsMaxBytes} bytes with ${key}.`);
    }
    this.#shared.text = text;
    this.#changed();
  }

  watch(listener: () => void): () => void {
    // A wrapper of its own, so one listener watched twice is stopped once each.
    const call = () => listener();
    this.#shared.listeners.add(call);
    return () => {
      this.#shared.listeners.delete(call);
    };
  }

  /** For tests: makes the saved settings unparsable, as a file cut off halfway would be. */
  damage(): void {
    this.#shared.text = this.#shared.text.slice(0, -1);
    this.#changed();
  }

  #changed(): void {
    for (const listener of [...this.#shared.listeners]) listener();
  }
}

/** The values in `text`, or none when it can't be parsed. Only `set` writes it, so it holds nothing else. */
function parseValues(text: string): HostSettingValues {
  try {
    return JSON.parse(text) as HostSettingValues;
  } catch {
    return {};
  }
}

function holdsOnlyFiniteNumbers(value: HostSettingValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || value === null) return true;
  return Object.values(value).every(holdsOnlyFiniteNumbers);
}
