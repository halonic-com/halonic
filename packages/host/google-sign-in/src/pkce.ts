import { encodeUtf8, type RandomBytes } from "@halonicjs/std";
import { encodeBase64url } from "./base64url.ts";
import { secretBytes, webRandomBytes } from "./random.ts";

/**
 * A PKCE pair for one sign-in (RFC 7636). The verifier is a secret: it stays
 * in memory with the pending sign-in and goes only to Google's token
 * endpoint. The challenge is public and goes in the auth URL.
 */
export interface PkcePair {
  /** 43 base64url characters from 32 random bytes. Never logged, stored or returned to a caller outside this package. */
  readonly verifier: string;
  /** The S256 challenge: base64url of the SHA-256 of the verifier. */
  readonly challenge: string;
  /** Always `"S256"`; the plain method is never used. */
  readonly method: "S256";
}

/**
 * The S256 challenge for a verifier: base64url, without padding, of the
 * SHA-256 of its ASCII bytes (RFC 7636, section 4.2).
 *
 * @param verifier - the PKCE verifier
 * @returns the challenge to put in the auth URL
 *
 * @example
 * await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
 * // "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(encodeUtf8(verifier)));
  return encodeBase64url(new Uint8Array(digest));
}

/**
 * Makes a new PKCE verifier and its S256 challenge.
 *
 * @param randomBytes - where the verifier's 32 bytes come from; tests pass fixed bytes
 * @returns the pair
 * @throws AssertionError when `randomBytes` returns another number of bytes than 32
 *
 * @example
 * const pkce = await createPkcePair();
 * pkce.verifier.length; // 43
 */
export async function createPkcePair(randomBytes: RandomBytes = webRandomBytes): Promise<PkcePair> {
  const verifier = encodeBase64url(secretBytes(randomBytes));
  return { verifier, challenge: await pkceChallenge(verifier), method: "S256" };
}
