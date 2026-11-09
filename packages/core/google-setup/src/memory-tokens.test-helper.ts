import { secretKey, type TokenStore } from "@halonicjs/ports";

/** A token store in memory that tests can look into, keyed by canonical name. */
export interface MemoryTokens extends TokenStore {
  readonly values: Map<string, string>;
}

/**
 * The memory `TokenStore` for tests. It follows the port's name rule like the
 * real adapter: a bad name throws a `RangeError`, and names that differ only
 * in case or in `-` versus `_` are the same token.
 */
export function memoryTokens(): MemoryTokens {
  const values = new Map<string, string>();
  const canonical = (name: string): string => secretKey(name).toLowerCase();
  return {
    values,
    get: async (name) => values.get(canonical(name)) ?? null,
    set: async (name, value) => {
      values.set(canonical(name), value);
    },
    remove: async (name) => {
      values.delete(canonical(name));
    },
  };
}
