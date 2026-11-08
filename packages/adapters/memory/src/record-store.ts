import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { copyJson } from "./copy.ts";

/** Record changes in a list per collection. Collection names are only ever map keys. */
export class MemoryRecordStore implements RecordStore {
  readonly #collections = new Map<string, RecordChange[]>();

  async append(changes: readonly RecordChange[]): Promise<void> {
    for (const change of copyJson(changes)) {
      const log = this.#collections.get(change.collection) ?? [];
      log.push(change);
      this.#collections.set(change.collection, log);
    }
  }

  async changes(collection: string): Promise<RecordChange[]> {
    return copyJson(this.#collections.get(collection) ?? []);
  }

  async compact(collection: string): Promise<void> {
    const log = this.#collections.get(collection);
    if (log !== undefined) {
      this.#collections.set(collection, compactedChanges(collection, log));
    }
  }
}
