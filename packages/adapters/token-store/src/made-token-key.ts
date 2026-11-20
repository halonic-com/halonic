import { foldRecords, type RecordStore, type Secrets, secretKey } from "@halonicjs/ports";
import { encodeBase64url, KindedError } from "@halonicjs/std";
import { keyLength, tokenKeySecret } from "./token-key.ts";
import { tokenCollection } from "./token-store.ts";

/** Where a made key is kept: a store that writes a value only when the name has none yet. */
export interface TokenKeyStore {
  /**
   * Stores `value` under `name` when nothing is stored there yet, as one step
   * no other writer can get between, and answers what is stored afterwards:
   * `value`, or the value another writer stored first.
   */
  setIfMissing(name: string, value: string): Promise<string>;
}

/** What {@link madeTokenKey} needs. */
export interface MadeTokenKeyOptions {
  /** Where a key is read first, such as the environment, then `store`. A key found here is always used. */
  readonly secrets: Secrets;
  /** Where a made key is kept. */
  readonly store: TokenKeyStore;
  /**
   * Every record store whose tokens the key seals. While any holds a token,
   * no key is made: a new key couldn't open them.
   */
  readonly tokenRecords: readonly RecordStore[];
  /** Random bytes for a new key; the system's cryptographic generator by default. */
  readonly randomBytes?: (count: number) => Uint8Array;
}

/**
 * The token key is gone while sealed tokens remain, so a new key would leave
 * them unreadable. The message never holds a key or a token.
 */
export class TokenKeyMissingError extends KindedError {
  constructor() {
    super(
      "conflict",
      "The token key that sealed this profile's saved secrets and sign-ins is missing, so they can't be opened.",
      {
        fix: "Set HALONIC_SECRET_TOKEN_KEY to the key you used before, then try again.",
      },
    );
  }
}

/**
 * The secrets a token store reads its key from, making the key the first
 * time one is needed, so nobody has to make one by hand.
 *
 * `token-key` is read from `secrets` first: a key set there, such as
 * `HALONIC_SECRET_TOKEN_KEY` in the environment, always wins and nothing is
 * written. Without one, a new key of 32 random bytes in base64url is stored
 * with `store.setIfMissing`, so when two programs make one at the same
 * moment both use the one stored first. No key is made while a token is
 * sealed in `tokenRecords`: that is a {@link TokenKeyMissingError}. Every
 * other name is read from `secrets` as it is. The key is never logged.
 *
 * @example
 * const secrets = madeTokenKey({ secrets: envThenFile, store: file, tokenRecords: [tokens] });
 * const tokenStore = createTokenStore({ records: tokens, secrets, clock });
 */
export function madeTokenKey(options: MadeTokenKeyOptions): Secrets {
  const { secrets, store, tokenRecords } = options;
  const randomBytes =
    options.randomBytes ?? ((count) => crypto.getRandomValues(new Uint8Array(count)));
  const tokenKeyName = secretKey(tokenKeySecret);

  return {
    async get(name) {
      const found = await secrets.get(name);
      if (found !== null || secretKey(name) !== tokenKeyName) {
        return found;
      }
      if (await holdsAnyToken(tokenRecords)) {
        throw new TokenKeyMissingError();
      }
      return store.setIfMissing(tokenKeySecret, encodeBase64url(randomBytes(keyLength)));
    },
  };
}

async function holdsAnyToken(stores: readonly RecordStore[]): Promise<boolean> {
  for (const records of stores) {
    if (foldRecords(await records.changes(tokenCollection)).size > 0) {
      return true;
    }
  }
  return false;
}
