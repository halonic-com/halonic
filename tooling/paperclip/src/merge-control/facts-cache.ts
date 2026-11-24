/**
 * What the facts reader keeps between passes in the worker's memory, so a
 * pass every minute reads GitHub only for what changed: a finished run's
 * failed jobs, a head's manifests, a file on one `main` commit and who
 * reran or cancelled a run never change once read. Lost on a restart,
 * which only costs one slower pass.
 */

/** Entries a cache keeps before it drops its oldest. */
export const cacheLimit = 2000;

/** A map that forgets its oldest entries past `limit`. */
export interface BoundedCache<V> {
  get(key: string): V | undefined;
  has(key: string): boolean;
  set(key: string, value: V): void;
  /** The keys, oldest first. */
  keys(): string[];
}

/** A new bounded cache. */
export function boundedCache<V>(limit = cacheLimit): BoundedCache<V> {
  const entries = new Map<string, V>();
  return {
    get: (key) => entries.get(key),
    has: (key) => entries.has(key),
    keys: () => [...entries.keys()],
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      for (const oldest of entries.keys()) {
        if (entries.size <= limit) {
          break;
        }
        entries.delete(oldest);
      }
    },
  };
}

/** Reads `key` once: later calls get the kept value. A failed read isn't kept. */
export async function cached<V>(
  cache: BoundedCache<V>,
  key: string,
  read: () => Promise<V>,
): Promise<V> {
  if (cache.has(key)) {
    return cache.get(key) as V;
  }
  const value = await read();
  cache.set(key, value);
  return value;
}
