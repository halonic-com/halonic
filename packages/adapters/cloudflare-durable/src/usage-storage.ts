import type { UsageStorage } from "./usage-types.ts";

/** What {@link usageStorageOf} reads from a Durable Object's `ctx.storage`. */
export interface KvStorageOwner {
  readonly kv: {
    get<T>(key: string): T | undefined;
    put<T>(key: string, value: T): void;
    delete(key: string): unknown;
    list<T>(options: { prefix: string }): Iterable<[string, T]>;
  };
  transactionSync<T>(change: () => T): T;
}

/**
 * The {@link UsageStorage} of a Durable Object's SQLite storage: its synchronous key-value API and
 * its `transactionSync`. The account changes what `get` gives it before it writes it back, and the
 * key-value API reads each value from SQLite afresh, so a value changed in memory never reaches
 * storage unless it is put. A transaction that throws writes nothing.
 */
export function usageStorageOf(storage: KvStorageOwner): UsageStorage {
  return {
    transactionSync: (change) => storage.transactionSync(change),
    get: (key) => storage.kv.get(key),
    put: (key, value) => storage.kv.put(key, value),
    delete: (key) => {
      storage.kv.delete(key);
    },
    list: (prefix) => storage.kv.list({ prefix }),
  };
}
