import type { RecordChange, RecordStore } from "@halonicjs/ports";

/** A record store in memory whose log tests can read. */
export interface MemoryRecords extends RecordStore {
  readonly log: RecordChange[];
}

/** The memory `RecordStore` for tests. It copies changes in and out, like a real store. */
export function memoryRecords(): MemoryRecords {
  const log: RecordChange[] = [];
  const copied = (changes: readonly RecordChange[]) =>
    JSON.parse(JSON.stringify(changes)) as RecordChange[];
  return {
    log,
    append: async (changes) => {
      log.push(...copied(changes));
    },
    changes: async (collection) => copied(log.filter((change) => change.collection === collection)),
    compact: async () => {},
  };
}
