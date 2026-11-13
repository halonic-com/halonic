import { createState as createOAuthState, stateMatches } from "@halonicjs/oauth-sign-in";
import type { RandomBytes } from "@halonicjs/std";
import { webRandomBytes } from "./web-platform.ts";

export { stateMatches };

/**
 * Makes a new OAuth `state` for one sign-in: 32 random bytes as 43 base64url characters.
 *
 * @param randomBytes - where the 32 bytes come from; tests pass fixed bytes
 * @returns the `state`
 * @throws AssertionError when `randomBytes` returns another number of bytes than 32
 */
export function createState(randomBytes: RandomBytes = webRandomBytes): string {
  return createOAuthState(randomBytes);
}
