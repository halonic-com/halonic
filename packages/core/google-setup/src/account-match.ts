/**
 * Whether the account that signed in is the connector's account. Spaces
 * around either address and the letter case don't count, as Google treats
 * addresses case-insensitively. Nothing else is folded: no Gmail dots, no
 * `+` suffix. Google gives back the canonical address of the account that
 * signed in, so a dot or a suffix means another address the user typed, and
 * the user should see that rather than have it pass silently.
 *
 * The caller compares only an address Google has verified (`email_verified`
 * in the ID token), so a matching address can't be claimed by someone else.
 *
 * @param expected - the connector's address, from the setup
 * @param signedInAs - the verified address from Google's ID token
 * @example
 * accountMatches("Someone@Example.com ", "someone@example.com"); // true
 * accountMatches("someone@example.com", "some.one@example.com"); // false
 */
export function accountMatches(expected: string, signedInAs: string): boolean {
  const wanted = normaliseAddress(expected);
  return wanted !== "" && wanted === normaliseAddress(signedInAs);
}

function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}
