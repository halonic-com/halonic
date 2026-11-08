/**
 * A reference from the `IdGenerator`, such as `gclient_mfx3k2a1_a1b2c3d4`:
 * lower-case letters and digits in parts joined by `_`. Lower case and no `-`
 * matter because the `TokenStore` treats names that differ only in case or in
 * `-` versus `_` as the same token, so two different refs could otherwise
 * land on one stored name.
 */
const refPattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * The longest ref that still fits the longest name built from it,
 * `google-client-<ref>-staged`, into the 128 characters a token name may have.
 */
const maxRefLength = 128 - "google-client-".length - "-staged".length;

/** The prefix `saveClientSecret` gives the `IdGenerator` for a new client ref: `gclient_…`. Internal. */
export const clientRefPrefix = "gclient";

/** The prefix the setup records give the `IdGenerator` for a new account ref: `gaccount_…`. Internal. */
export const accountRefPrefix = "gaccount";

/**
 * Whether a client or account ref follows the rule, so a token name built
 * from it reaches only that ref's tokens. The setup record checks the refs
 * it reads with this. Internal.
 */
export function isSetupRef(ref: string): boolean {
  // `google-client-<a>-staged` and `google-client-<b>` are the same token when
  // b is `<a>_staged`, so no ref may end in that word.
  return ref.length <= maxRefLength && refPattern.test(ref) && !ref.endsWith("_staged");
}

/**
 * Checks a client or account ref before it becomes part of a token name. Refs
 * come back from the setup record, so a changed record must not reach another
 * token.
 *
 * @throws RangeError when the ref breaks the rule. The message is fixed and
 *   never repeats the ref: with swapped arguments or a damaged setup record,
 *   the "ref" can be a client secret (plan D6).
 */
function checkRef(ref: string): string {
  if (ref.length > maxRefLength || !refPattern.test(ref)) {
    throw new RangeError(
      `This is not a Google setup ref. Use lower-case letters and digits joined by "_", at most ${maxRefLength} characters.`,
    );
  }
  if (!isSetupRef(ref)) {
    throw new RangeError(`This is not a Google setup ref: it may not end in "_staged".`);
  }
  return ref;
}

/**
 * The token name of the client secret in use for a client ref.
 *
 * @example
 * clientSecretName("gclient_1"); // "google-client-gclient_1"
 */
export function clientSecretName(clientRef: string): string {
  return `google-client-${checkRef(clientRef)}`;
}

/**
 * The token name of a new client secret that waits for Google to accept it
 * (design 4.3).
 *
 * @example
 * stagedClientSecretName("gclient_1"); // "google-client-gclient_1-staged"
 */
export function stagedClientSecretName(clientRef: string): string {
  return `google-client-${checkRef(clientRef)}-staged`;
}

/**
 * The token name of a Google account's refresh token, one per account ref from
 * the setup record (plan D2). Never an e-mail address.
 *
 * @example
 * refreshTokenName("gaccount_1"); // "google-account-gaccount_1"
 */
export function refreshTokenName(accountRef: string): string {
  return `google-account-${checkRef(accountRef)}`;
}
