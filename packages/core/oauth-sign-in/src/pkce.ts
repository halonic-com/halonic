import type { Digest } from "@halonicjs/ports";
import { encodeBase64url, encodeUtf8, type RandomBytes } from "@halonicjs/std";
import { secretBytes } from "./random.ts";

/**
 * A PKCE pair for one sign-in (RFC 7636). The verifier is a secret: it stays
 * in memory with the pending sign-in and goes only to the provider's token
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
 * @param digest - the platform's SHA-256
 * @returns the challenge to put in the auth URL
 *
 * @example
 * await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", digest);
 * // "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 */
export async function pkceChallenge(verifier: string, digest: Digest): Promise<string> {
  return encodeBase64url(await digest.sha256(encodeUtf8(verifier)));
}

/**
 * Makes a new PKCE verifier and its S256 challenge.
 *
 * @param randomBytes - where the verifier's 32 bytes come from; tests pass fixed bytes
 * @param digest - the platform's SHA-256
 * @returns the pair
 * @throws AssertionError when `randomBytes` returns another number of bytes than 32
 *
 * @example
 * const pkce = await createPkcePair(randomBytes, digest);
 * pkce.verifier.length; // 43
 */
export async function createPkcePair(randomBytes: RandomBytes, digest: Digest): Promise<PkcePair> {
  const verifier = encodeBase64url(secretBytes(randomBytes));
  return { verifier, challenge: await pkceChallenge(verifier, digest), method: "S256" };
}
