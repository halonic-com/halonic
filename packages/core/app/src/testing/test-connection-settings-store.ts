import type {
  ConnectionKey,
  ConnectionSettingsRecord,
  ConnectionSettingsStore,
} from "@halonicjs/ports";

/**
 * A small in-memory `ConnectionSettingsStore` for the kernel's own tests,
 * with a way to make settings unreadable. A deliberate fake: core may not
 * use adapters, not even in tests.
 */
export class TestConnectionSettingsStore implements ConnectionSettingsStore {
  private readonly saved = new Map<string, ConnectionSettingsRecord>();
  private readonly unreadable = new Set<string>();

  async get(key: ConnectionKey): Promise<ConnectionSettingsRecord | null> {
    const id = keyId(key);
    if (this.unreadable.has(id)) {
      throw new Error(`the settings of ${id} can't be read`);
    }
    const settings = this.saved.get(id);
    return settings === undefined ? null : { ...settings };
  }

  async save(settings: ConnectionSettingsRecord): Promise<void> {
    const id = keyId(settings);
    this.unreadable.delete(id);
    this.saved.set(id, { ...settings });
  }

  async remove(key: ConnectionKey): Promise<void> {
    const id = keyId(key);
    this.unreadable.delete(id);
    this.saved.delete(id);
  }

  /** Makes `get` throw for one connector until its settings are saved or removed. */
  breakSettings(key: ConnectionKey): void {
    this.unreadable.add(keyId(key));
  }
}

/** One string per key. JSON keeps a location with a `/` or `:` from running into the connector id. */
function keyId(key: ConnectionKey): string {
  return JSON.stringify([key.location, key.connector]);
}
