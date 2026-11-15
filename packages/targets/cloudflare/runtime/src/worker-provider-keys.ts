import { type ProviderKeyStore, ProviderKeysReadOnlyError } from "@halonicjs/host-server";
import type { Secrets } from "@halonicjs/ports";

/**
 * The Worker's provider keys: the Workers secrets the deployer set with
 * `halonic deploy` or `wrangler secret put`. A Worker can't change its own
 * secrets, so `has` answers and `set` and `remove` refuse, which the key
 * routes turn into a 409 `keys_read_only` once their own checks have passed.
 * A value is read only to see that it is there.
 *
 * @example
 * await workerProviderKeys(workerSecrets(env)).has("openai-key"); // true when the deployer set it
 */
export function workerProviderKeys(secrets: Secrets): ProviderKeyStore {
  async function refuse(): Promise<never> {
    throw new ProviderKeysReadOnlyError();
  }
  return {
    has: async (name) => (await secrets.get(name)) !== null,
    set: refuse,
    remove: refuse,
  };
}
