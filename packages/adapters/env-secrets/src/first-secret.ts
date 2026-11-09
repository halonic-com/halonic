import type { Secrets } from "@halonicjs/ports";

/**
 * Secrets that ask each store in order and give the first value that isn't
 * `null`. The CLI uses `firstSecret(env, keychain)`: the environment wins, so
 * a CI runner without a keychain works with the environment alone.
 *
 * A store that throws stops the search and the error reaches the caller
 * unchanged: a broken keychain is a problem to report, not a missing secret.
 * A name that breaks the rule is refused by the first store, so no later
 * store is asked for it.
 *
 * @param first - the store asked first; at least one is required, so the name is always checked
 * @param rest - the stores asked next, in order
 */
export function firstSecret(first: Secrets, ...rest: readonly Secrets[]): Secrets {
  const stores = [first, ...rest];
  return {
    async get(name: string): Promise<string | null> {
      for (const store of stores) {
        const value = await store.get(name);
        if (value !== null) {
          return value;
        }
      }
      return null;
    },
  };
}
