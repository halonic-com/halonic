import { randomBytes } from "node:crypto";
import { constantTimeEqual, encodeBase64url, encodeUtf8 } from "@halonicjs/std";

/** 32 random bytes: as strong as a provider key, and short enough for a header. */
const runTokenBytes = 32;

/**
 * A new random token for one run's bridge, from Node's cryptographic random
 * source. Base64url, so it fits in a header without escaping.
 */
export function randomRunToken(): string {
  return encodeBase64url(randomBytes(runTokenBytes));
}

/**
 * True when a request's token header holds exactly the run's token. The
 * comparison takes the same time wherever the two first differ, so a program
 * can't guess the token byte by byte. A missing header, or one sent twice,
 * never matches.
 */
export function runTokenMatches(sent: string | string[] | undefined, token: string): boolean {
  if (typeof sent !== "string") return false;
  return constantTimeEqual(encodeUtf8(sent), encodeUtf8(token));
}
