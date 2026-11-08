import { randomUUID } from "node:crypto";

/**
 * A lease token from Node's cryptographic random source: unique across
 * restarts and processes, and not guessable, so only the holder can renew or
 * release its lease.
 */
export function randomLeaseToken(): string {
  return `lease_${randomUUID()}`;
}
