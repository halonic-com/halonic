import type { Clock, RecordChange, RecordStore, Secrets, TokenStore } from "@halonicjs/ports";
import { damaged, openToken, sealToken } from "./sealed-value.ts";
import { loadTokenKey, type TokenKey } from "./token-key.ts";
import { canonicalTokenName } from "./token-name.ts";

/**
 * The collection the tokens live in. Workspace collection ids must start
 * with a letter or digit, so a user can never create a collection with this
 * name and reach the tokens through it.
 */
export const tokenCollection = "_tokens";

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
 * old token. A value that won't open throws `UnreadableTokenError` and is
 * never reported as "no token".
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
    foldRecord(await records.changes(tokenCollection), id);

  const change = (op: RecordChange["op"], id: string, values: RecordChange["values"]) => ({
    at: clock.now().toISOString(),
    collection: tokenCollection,
    id,
    op,
    values,
  });

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
    },

    async remove(name) {
      const id = canonicalTokenName(name);
      if ((await currentValues(id)) === undefined) {
        return;
      }
      await records.append([change("remove", id, null)]);
    },
  };
}

/** One record's current values, from its changes oldest first, or `undefined` when there is none. */
function foldRecord(
  changes: readonly RecordChange[],
  id: string,
): Record<string, unknown> | undefined {
  let values: Record<string, unknown> | undefined;
  for (const entry of changes) {
    if (entry.id !== id) {
      continue;
    }
    if (entry.op === "remove") {
      values = undefined;
    } else if (entry.op === "update") {
      values = { ...values, ...entry.values };
    } else {
      values = { ...entry.values };
    }
  }
  return values;
}
