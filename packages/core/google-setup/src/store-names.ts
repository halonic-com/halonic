/** The prefix `saveClientSecret` gives the `IdGenerator` for a new client ref: `gclient_…`. */
export const clientRefPrefix = "gclient";

/** The prefix for a Google account's ref in its setup record: `gaccount_…`. */
export const accountRefPrefix = "gaccount";

/**
 * The shape of an id from `randomIds` with the given prefix: the prefix, `_`,
 * the time in base 36 (at most 11 digits for any `Date`), `_` and 4 bytes in
 * hex, such as `gclient_mfx3k2a1_a1b2c3d4`.
 *
 * Lower case and no `-` matter because the `TokenStore` treats names that
 * differ only in case or in `-` versus `_` as the same token. Ending in hex
 * digits means no ref ends in `_staged`, so `google-client-<ref>` can never be
 * another ref's `google-client-<ref>-staged`.
 */
function randomIdPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}_[0-9a-z]{1,11}_[0-9a-f]{8}$`);
}

type RefPrefix = typeof clientRefPrefix | typeof accountRefPrefix;

const refPatterns: Record<RefPrefix, RegExp> = {
  [clientRefPrefix]: randomIdPattern(clientRefPrefix),
  [accountRefPrefix]: randomIdPattern(accountRefPrefix),
};

/**
 * Checks a ref before it becomes part of a token name. Refs come back from
 * the setup record, so an edited record must not reach another token (plan
 * D2, from the security review).
 *
 * @throws RangeError when the ref isn't a `randomIds` id with the given
 *   prefix. The message holds the ref, which is an id, never a secret.
 */
function checkRef(ref: string, prefix: RefPrefix): string {
  if (!refPatterns[prefix].test(ref)) {
    throw new RangeError(
      `"${ref}" is not a Google setup ref. It must look like ${prefix}_mfx3k2a1_a1b2c3d4.`,
    );
  }
  return ref;
}

/**
 * The token name of the client secret in use for a client ref.
 *
 * @example
 * clientSecretName("gclient_mfx3k2a1_a1b2c3d4"); // "google-client-gclient_mfx3k2a1_a1b2c3d4"
 */
export function clientSecretName(clientRef: string): string {
  return `google-client-${checkRef(clientRef, clientRefPrefix)}`;
}

/**
 * The token name of a new client secret that waits for Google to accept it
 * (design 4.3).
 *
 * @example
 * stagedClientSecretName("gclient_mfx3k2a1_a1b2c3d4"); // "google-client-gclient_mfx3k2a1_a1b2c3d4-staged"
 */
export function stagedClientSecretName(clientRef: string): string {
  return `google-client-${checkRef(clientRef, clientRefPrefix)}-staged`;
}

/**
 * The token name of a Google account's refresh token, one per account ref
 * from the setup record (plan D2). Never an e-mail address.
 *
 * @example
 * refreshTokenName("gaccount_mfx3k2a1_a1b2c3d4"); // "google-account-gaccount_mfx3k2a1_a1b2c3d4"
 */
export function refreshTokenName(accountRef: string): string {
  return `google-account-${checkRef(accountRef, accountRefPrefix)}`;
}
