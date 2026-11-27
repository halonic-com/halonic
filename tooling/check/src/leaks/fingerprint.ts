import { createHash } from "node:crypto";

/**
 * A short, one-way fingerprint of a matched value. The allow file names
 * a secret-shaped value by fingerprint, so it can allow exactly that value
 * and nothing else, without the value itself entering the repo.
 */
export function fingerprint(value: string): string {
  return `fp:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}
