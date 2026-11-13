import { constantTimeEqual, encodeBase64url, encodeUtf8, type RandomBytes } from "@halonicjs/std";
import { secretBytes, webRandomBytes } from "./random.ts";

/**
 * Makes a new OAuth `state` for one sign-in: 32 random bytes as 43 base64url
 * characters. It ties Google's callback to the sign-in that started it, so a
 * request forged by another page or local process matches nothing.
 *
 * @param randomBytes - where the 32 bytes come from; tests pass fixed bytes
 * @returns the `state`
 * @throws AssertionError when `randomBytes` returns another number of bytes than 32
 *
 * @example
 * createState().length; // 43
 */
export function createState(randomBytes: RandomBytes = webRandomBytes): string {
  return encodeBase64url(secretBytes(randomBytes));
}

/**
 * Checks the `state` that came back in a callback against the one a sign-in
 * expects. The comparison takes the same time wherever the two first differ,
 * so timing tells an attacker nothing about the expected `state`. Its length
 * isn't secret: every `state` is 43 characters.
 *
 * @param expected - the `state` the pending sign-in holds
 * @param received - the `state` query parameter, or `null` or `undefined` when it was missing
 * @returns true only when both are present and equal; a missing or empty `state` never matches
 *
 * @example
 * stateMatches(pending.state, url.searchParams.get("state")); // true or false
 */
export function stateMatches(expected: string, received: string | null | undefined): boolean {
  if (received === null || received === undefined || received === "" || expected === "") {
    return false;
  }
  return constantTimeEqual(encodeUtf8(expected), encodeUtf8(received));
}
