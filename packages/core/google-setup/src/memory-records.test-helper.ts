import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";

/** A record store in memory whose log tests can read and change. */
export interface MemoryRecords extends RecordStore {
  readonly log: RecordChange[];
}

/** A copy of JSON-shaped changes, so a test can't change the log by accident. */
function copied(changes: readonly RecordChange[]): RecordChange[] {
  return JSON.parse(JSON.stringify(changes)) as RecordChange[];
}

/** The memory `RecordStore` for tests. It copies changes in and out, like a real store. */
export function memoryRecords(): MemoryRecords {
  const log: RecordChange[] = [];
  return {
    log,
    append: async (changes) => {
      log.push(...copied(changes));
    },
    changes: async (collection) => copied(log.filter((change) => change.collection === collection)),
    compact: async (collection) => {
      const kept = log.filter((change) => change.collection !== collection);
      const compacted = compactedChanges(
        collection,
        log.filter((change) => change.collection === collection),
      );
      log.splice(0, log.length, ...kept, ...compacted);
    },
  };
}
