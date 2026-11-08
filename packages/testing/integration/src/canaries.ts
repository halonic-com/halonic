import type { Secrets } from "@halonicjs/ports";

/**
 * The fake value the suite configures for a secret. A check fails when a
 * canary shows up anywhere but the place the kit put it: a tool result, an
 * error, the request log, or a request to a host the secret may not go to.
 *
 * @example
 * canaryFor("openai-key"); // "CANARY-openai-key-5f1d"
 */
export function canaryFor(secret: string): string {
  return `CANARY-${secret}-5f1d`;
}

/** Every canary starts with this, so one search finds them all. */
export const canaryMark = "CANARY-";

/** A `Secrets` port that answers every name with its canary. */
export const canarySecrets: Secrets = {
  get: async (name) => canaryFor(name),
};
