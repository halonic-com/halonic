import {
  type Clock,
  foldRecords,
  type RecordChange,
  type RecordStore,
  type Secrets,
  type TokenStore,
} from "@halonicjs/ports";
import { damaged, openToken, sealToken } from "./sealed-value.ts";
import { loadTokenKey, type TokenKey } from "./token-key.ts";
import { canonicalTokenName } from "./token-name.ts";

/**
 * The collection the tokens live in. Workspace collection ids must start
 * with a letter or digit, so a user can never create a collection with this
 * name and reach the tokens through it.
 */
export const tokenCollection = "_tokens";

/**
 * How often the store compacts `_tokens` after a change, the first try included. A store may
 * refuse a compaction because another one finished first (D1 does, see `D1RecordStore.compact`);
 * the next try reads the log that one left, so a few writes at once each get through.
 */
const compactAttempts = 3;

/** What {@link createTokenStore} needs: the record store, the secrets that hold the key, and a clock. */
export interface TokenStoreOptions {
  /**
   * Where the sealed tokens are kept. **Agents and tools must not be able to
   * write to it**: anyone who can append to it can remove a token, or roll it
   * back to an older sealed value.
   */
  readonly records: RecordStore;
  /** Where the `token-key` secret is read from. */
  readonly secrets: Secrets;
  /** The time each change is stamped with. */
  readonly clock: Clock;
}

/**
 * A `TokenStore` that keeps each token AES-256-GCM-encrypted in a
 * `RecordStore`, using Web Crypto only, so it runs in Node and in workerd.
 *
 * The key is the configured secret `token-key` (32 random bytes in
 * base64url). It is read the first time a token has to be sealed or opened,
 * so a server that never stores a token doesn't need one. A failed read is
 * not remembered, so setting the secret takes effect without a restart.
 *
 * Every `get` reads the store, so several server instances never see an
 * old token. After a replace or a remove the store compacts `_tokens`, so
 * the old sealed value leaves the record store's storage. A refused compaction is tried again,
 * so a write that meets another one at the same time still resolves; it rejects only when every
 * try failed, and then its change is stored and the next replace or remove compacts again.
 * A value that won't open throws `UnreadableTokenError` and is never reported as "no token".
 *
 * @example
 * const tokens = createTokenStore({ records, secrets, clock });
 * await tokens.set("google-refresh", refreshToken);
 * await tokens.get("Google_Refresh"); // the same token
 */
export function createTokenStore(options: TokenStoreOptions): TokenStore {
  const { records, secrets, clock } = options;
  let keyLoad: Promise<TokenKey> | undefined;

  const tokenKey = (): Promise<TokenKey> => {
    keyLoad ??= loadTokenKey(secrets).catch((error: unknown) => {
      keyLoad = undefined;
      throw error;
    });
    return keyLoad;
  };

  const currentValues = async (id: string): Promise<Record<string, unknown> | undefined> =>
    foldRecords(await records.changes(tokenCollection)).get(id)?.values;

  const change = (op: RecordChange["op"], id: string, values: RecordChange["values"]) => ({
    at: clock.now().toISOString(),
    collection: tokenCollection,
    id,
    op,
    values,
  });

  /** Compacts `_tokens`, trying again when a try fails; throws the last failure. */
  const compactTokens = async (): Promise<void> => {
    for (let attempt = 1; ; attempt++) {
      try {
        await records.compact(tokenCollection);
        return;
      } catch (error) {
        if (attempt >= compactAttempts) {
          throw error;
        }
      }
    }
  };

  return {
    async get(name) {
      const id = canonicalTokenName(name);
      const values = await currentValues(id);
      if (values === undefined) {
        return null;
      }
      const sealed = values["sealed"];
      if (typeof sealed !== "string") {
        throw damaged(name);
      }
      return openToken(await tokenKey(), name, id, sealed);
    },

    async set(name, value) {
      const id = canonicalTokenName(name);
      const sealed = await sealToken(await tokenKey(), id, value);
      const exists = (await currentValues(id)) !== undefined;
      await records.append([change(exists ? "update" : "add", id, { sealed })]);
      if (exists) {
        await compactTokens();
      }
    },

    async remove(name) {
      const id = canonicalTokenName(name);
      if ((await currentValues(id)) === undefined) {
        return;
      }
      await records.append([change("remove", id, null)]);
      await compactTokens();
    },
  };
}

/**
 * The names of every token kept in `records`, in their stored form (see
 * `canonicalTokenName`). Nothing is opened, so it needs no token key: a host
 * lists the tokens it must remove even when it can't read them.
 *
 * @example
 * await storedTokenNames(records); // ["google_refresh", "s6_gitlab_work_account"]
 */
export async function storedTokenNames(records: RecordStore): Promise<string[]> {
  return [...foldRecords(await records.changes(tokenCollection)).keys()];
}
