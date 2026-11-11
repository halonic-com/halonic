import {
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  hostSettingsMaxBytes,
  isHostSettingKey,
} from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";

interface Shared {
  text: string;
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
  /** When set, `set` throws it and saves nothing. */
  saveError: Error | undefined;

  constructor(sharedWith?: TestHostSettingsStore) {
    this.#shared =
      sharedWith === undefined ? { text: "{}", listeners: new Set() } : sharedWith.#shared;
  }

  async read(): Promise<HostSettingValues> {
    if (this.readError !== undefined) throw this.readError;
    return this.#parsed();
  }

  async set(key: string, value: HostSettingValue | undefined): Promise<void> {
    if (this.saveError !== undefined) throw this.saveError;
    if (!isHostSettingKey(key)) throw new RangeError(`${key} can't name a setting.`);
    if (value !== undefined && !finiteOnly(value)) {
      throw new RangeError(`The value for ${key} has a number that isn't finite.`);
    }
    // Without waiting in between, so saves made together land one after the other.
    const values: Record<string, HostSettingValue> = { ...this.#parsed() };
    if (value === undefined) delete values[key];
    else values[key] = value;
    const text = JSON.stringify(values);
    if (encodeUtf8(text).byteLength > hostSettingsMaxBytes) {
      throw new RangeError(`The settings would be over ${hostSettingsMaxBytes} bytes.`);
    }
    this.#shared.text = text;
    this.#changed();
  }

  watch(listener: () => void): () => void {
    const call = () => listener();
    this.#shared.listeners.add(call);
    return () => {
      this.#shared.listeners.delete(call);
    };
  }

  /** Makes the saved settings unparsable, and tells the watchers. */
  damage(): void {
    this.#shared.text = this.#shared.text.slice(0, -1);
    this.#changed();
  }

  #parsed(): HostSettingValues {
    try {
      return JSON.parse(this.#shared.text) as HostSettingValues;
    } catch {
      return {};
    }
  }

  #changed(): void {
    for (const listener of [...this.#shared.listeners]) listener();
  }
}

function finiteOnly(value: HostSettingValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || value === null) return true;
  return Object.values(value).every(finiteOnly);
}
