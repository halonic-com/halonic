/** Version of the {@link RecordStore} port. A breaking change bumps it and comes with an ADR. */
export const recordStoreVersion = 2;

/** One change to a record in a collection. The current records are the log folded up. */
export interface RecordChange {
  at: string;
  collection: string;
  id: string;
  op: "add" | "update" | "remove" | "seed";
  /** add, seed: all values; update: only the changed ones; remove: null. */
  values: Record<string, unknown> | null;
  /** The run (and agent) or person that made the change. */
  by?: { runId?: string; agent?: string; person?: string };
}

/**
 * The data in collections, kept as a log of changes per collection and never
 * in git. Collection names are values, never table or file names chosen by
 * the caller.
 */
export interface RecordStore {
  /** Appends changes, in order. Changes to several collections may come in one call. */
  append(changes: readonly RecordChange[]): Promise<void>;
  /** Every change to a collection, oldest first. Empty for an unknown collection. */
  changes(collection: string): Promise<RecordChange[]>;
  /**
   * Replaces a collection's log with its current records, so overwritten and
   * removed values leave the storage. Afterwards {@link changes} gives one
   * `seed` per current record, with the values {@link foldRecords} gives, the
   * `at` of the record's last change and no `by`. Other collections stay as
   * they are; an unknown or empty collection stays empty.
   *
   * A change appended while a compact runs is either folded into the seeds
   * or kept after them, never lost; for example, read, fold and replace in
   * one transaction or under the store's write lock.
   */
  compact(collection: string): Promise<void>;
}

/** A record as its changes leave it: its current values and the time of its last change. */
export interface CurrentRecord {
  values: Record<string, unknown>;
  at: string;
}

/**
 * Folds changes, oldest first, into the current records by id. `add` and
 * `seed` set all values, `update` merges its values into the record's, and
 * `remove` drops the record. Every reader of a {@link RecordStore} and every
 * {@link RecordStore.compact} folds this way.
 *
 * @example
 * const leads = foldRecords(await records.changes("leads"));
 * leads.get("1")?.values; // { name: "Ada L." }
 */
export function foldRecords(changes: readonly RecordChange[]): Map<string, CurrentRecord> {
  const records = new Map<string, CurrentRecord>();
  for (const change of changes) {
    if (change.op === "remove") {
      records.delete(change.id);
      continue;
    }
    const earlier = change.op === "update" ? records.get(change.id)?.values : undefined;
    records.set(change.id, { values: { ...earlier, ...change.values }, at: change.at });
  }
  return records;
}

/**
 * What a collection's changes become when it is compacted: one `seed` per
 * current record, with its folded values, the `at` of its last change and
 * no `by`. Adapters write this in place of the collection's log.
 */
export function compactedChanges(
  collection: string,
  changes: readonly RecordChange[],
): RecordChange[] {
  return [...foldRecords(changes)].map(([id, record]) => ({
    at: record.at,
    collection,
    id,
    op: "seed",
    values: record.values,
  }));
}
