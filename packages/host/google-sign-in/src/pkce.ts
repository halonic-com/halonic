import {
  createPkcePair as createOAuthPkcePair,
  pkceChallenge as oauthPkceChallenge,
  type PkcePair,
} from "@halonicjs/oauth-sign-in";
import type { RandomBytes } from "@halonicjs/std";
import { webDigest, webRandomBytes } from "./web-platform.ts";

export type { PkcePair };

/**
 * The S256 challenge for a verifier (RFC 7636, section 4.2), with Web Crypto's SHA-256.
 *
 * @param verifier - the PKCE verifier
 * @returns the challenge to put in the auth URL
 */
export function pkceChallenge(verifier: string): Promise<string> {
  return oauthPkceChallenge(verifier, webDigest);
}

/**
 * Makes a new PKCE verifier and its S256 challenge.
 *
 * @param randomBytes - where the verifier's 32 bytes come from; tests pass fixed bytes
 * @returns the pair
 * @throws AssertionError when `randomBytes` returns another number of bytes than 32
 */
export function createPkcePair(randomBytes: RandomBytes = webRandomBytes): Promise<PkcePair> {
  return createOAuthPkcePair(randomBytes, webDigest);
}
