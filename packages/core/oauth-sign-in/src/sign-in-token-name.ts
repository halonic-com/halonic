/** The longest token name the `TokenStore` accepts. */
const maxTokenNameLength = 128;

/** An integration's or a sign-in's name in a sheet: lower-case words joined by `-`. */
const sheetNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * The token name a sign-in's refresh token and approved block are kept under:
 * `s<length>_<integration>_<sign-in>`, where `<length>` is the length of the
 * integration's name.
 *
 * The prefix `s` keeps these names apart from the `i…` names an integration's
 * own scoped store builds, so an integration's `host.tokens` can't reach them,
 * and from Google's `google-account-…` names. The length makes the split
 * between the two names clear: `a-b` with `c` and `a` with `b-c` can't meet.
 * Sheet names use only `-` between words, so the `TokenStore`'s rule that `-`
 * and `_` are the same character can't join two different pairs either.
 *
 * @param integration - the integration's id from its sheet
 * @param signIn - the sign-in's name from the sheet's `signIns`
 * @returns the token name
 * @throws RangeError when a name isn't a sheet name or the result is too long
 *
 * @example
 * signInTokenName("gitlab", "work-account"); // "s6_gitlab_work-account"
 */
export function signInTokenName(integration: string, signIn: string): string {
  for (const name of [integration, signIn]) {
    if (!sheetNamePattern.test(name)) {
      throw new RangeError("A sign-in token name needs lower-case words joined by '-'.");
    }
  }
  const tokenName = `s${integration.length}_${integration}_${signIn}`;
  if (tokenName.length > maxTokenNameLength) {
    throw new RangeError(
      `The integration's and the sign-in's names are too long for a token name (at most ${maxTokenNameLength} characters).`,
    );
  }
  return tokenName;
}
