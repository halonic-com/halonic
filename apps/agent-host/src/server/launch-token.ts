import { randomBytes } from "node:crypto";
import { encodeBase64url } from "@halonicjs/std";

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
