import type { PendingSignInDetails, PendingSignIns } from "@halonicjs/google-setup";
import { createPendingSignIns as createOAuthPendingSignIns } from "@halonicjs/oauth-sign-in";
import type { Clock } from "@halonicjs/ports";

/**
 * The pending Google sign-ins of one server, in memory only (plan D5): the
 * generic holder from `@halonicjs/oauth-sign-in`, for the details a
 * Google sign-in keeps.
 *
 * @param clock - the time a sign-in starts and expires by
 * @returns an empty holder
 *
 * @example
 * const pendingSignIns = createPendingSignIns(systemClock);
 */
export function createPendingSignIns(clock: Clock): PendingSignIns {
  return createOAuthPendingSignIns<PendingSignInDetails>(clock);
}
