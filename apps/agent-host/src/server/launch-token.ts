import { randomBytes } from "node:crypto";
import { constantTimeEqual, encodeBase64url, encodeUtf8 } from "@halonicjs/std";

/** 32 random bytes: as strong as a provider key, and short enough for a header. */
const launchTokenBytes = 32;

/**
 * A new random token for one launch of the host, from Node's cryptographic
 * random source. Base64url, so it fits in a header without escaping. The
 * host gives it only to the program that started it, on its standard output.
 */
export function randomLaunchToken(): string {
  return encodeBase64url(randomBytes(launchTokenBytes));
}

/**
 * True when a request's `Authorization` header is exactly `Bearer <token>`.
 * The comparison takes the same time wherever the two first differ, so a
 * program can't guess the token byte by byte. A missing header never matches.
 */
export function bearerMatches(authorization: string | undefined, token: string): boolean {
  if (authorization === undefined) return false;
  return constantTimeEqual(encodeUtf8(authorization), encodeUtf8(`Bearer ${token}`));
}
