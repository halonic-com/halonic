import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";

/**
 * A small in-memory `RecordStore` for the kernel's own tests. A deliberate
 * fake: core may not use adapters, not even in tests.
 */
export class TestRecordStore implements RecordStore {
  readonly #logs = new Map<string, RecordChange[]>();

  async append(changes: readonly RecordChange[]): Promise<void> {
    for (const change of changes) {
      const log = this.#logs.get(change.collection) ?? [];
      log.push(copy(change));
      this.#logs.set(change.collection, log);
    }
  }

  async changes(collection: string): Promise<RecordChange[]> {
    return copy(this.#logs.get(collection) ?? []);
  }

  async compact(collection: string): Promise<void> {
    const log = this.#logs.get(collection);
    if (log === undefined) return;
    this.#logs.set(collection, compactedChanges(collection, log));
  }
}

/** A copy, so a caller can't change what the store holds. Records are JSON data. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
