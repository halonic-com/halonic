import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";

/** A record store in memory whose log tests can read. */
export interface MemoryRecords extends RecordStore {
  /** Every change appended, in order. A compact leaves it as it is; `changes()` gives what the store keeps. */
  readonly log: RecordChange[];
}

/** The memory `RecordStore` for tests. It copies changes in and out and compacts, like a real store. */
export function memoryRecords(): MemoryRecords {
  const log: RecordChange[] = [];
  const stored = new Map<string, RecordChange[]>();
  const copied = (changes: readonly RecordChange[]) =>
    JSON.parse(JSON.stringify(changes)) as RecordChange[];
  return {
    log,
    append: async (changes) => {
      log.push(...copied(changes));
      for (const change of copied(changes)) {
        stored.set(change.collection, [...(stored.get(change.collection) ?? []), change]);
      }
    },
    changes: async (collection) => copied(stored.get(collection) ?? []),
    compact: async (collection) => {
      const changes = stored.get(collection);
      if (changes !== undefined) {
        stored.set(collection, compactedChanges(collection, changes));
      }
    },
  };
}
