/** Version of the {@link RecordStore} port. A breaking change bumps it and comes with an ADR. */
export const recordStoreVersion = 1;

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
}
