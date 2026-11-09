import type { TrustRecord, TrustStore } from "@halonicjs/ports";

/**
 * A small in-memory `TrustStore` for the kernel's own tests, with a way to
 * make it unreadable. A deliberate fake: core may not use adapters, not
 * even in tests.
 */
export class TestTrustStore implements TrustStore {
  private readonly records = new Map<string, TrustRecord>();
  private broken = false;

  async get(location: string): Promise<TrustRecord | null> {
    this.failIfBroken(location);
    return copy(this.records.get(location) ?? null);
  }

  async grant(record: TrustRecord): Promise<void> {
    this.records.set(record.location, copy(record));
  }

  async revoke(location: string): Promise<void> {
    this.records.delete(location);
  }

  async list(): Promise<TrustRecord[]> {
    const locations = [...this.records.keys()].sort((a, b) => (a < b ? -1 : 1));
    for (const location of locations) {
      this.failIfBroken(location);
    }
    return locations.map((location) => copy(this.records.get(location) as TrustRecord));
  }

  /** Makes `get` and `list` throw from now on, as a damaged profile would. */
  breakRecords(): void {
    this.broken = true;
  }

  private failIfBroken(location: string): void {
    if (this.broken) {
      throw new Error(`the trust record for ${JSON.stringify(location)} can't be read`);
    }
  }
}

/** A fresh copy through JSON, the way a record file round-trips. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
