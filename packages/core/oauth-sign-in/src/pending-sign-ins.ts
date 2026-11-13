import type { Clock } from "@halonicjs/ports";
import {
  hasPendingSignInExpired,
  type PendingSignIn,
  type PendingSignInDetails,
  type PendingSignIns,
} from "./pending-sign-in.ts";
import { stateMatches } from "./state.ts";

/**
 * The pending sign-ins of one server, in memory only (plan D5). Each call
 * returns a new holder with its own `Map`, so nothing lives in module memory:
 * the server creates one when it wires its routes and passes it in like a port.
 *
 * Every method is synchronous on purpose. `take` finds and removes a sign-in in
 * one step, so two callbacks with the same `state` can never both get it.
 *
 * @param clock - the time a sign-in starts and expires by
 * @returns an empty holder
 *
 * @example
 * const pendingSignIns = createPendingSignIns(systemClock);
 */
export function createPendingSignIns<Details extends PendingSignInDetails = PendingSignInDetails>(
  clock: Clock,
): PendingSignIns<Details> {
  const byAccount = new Map<string, PendingSignIn<Details>>();
  const isLive = (pending: PendingSignIn<Details>): boolean =>
    !hasPendingSignInExpired(pending, clock.now());

  return {
    start(accountRef: string, pending: Details): void {
      byAccount.set(accountRef, { ...pending, accountRef, startedAt: clock.now() });
    },

    authUrlFor(accountRef: string): string | undefined {
      const pending = byAccount.get(accountRef);
      return pending !== undefined && isLive(pending) ? pending.authUrl : undefined;
    },

    cancel(accountRef: string): void {
      byAccount.delete(accountRef);
    },

    take(state: string): PendingSignIn<Details> | undefined {
      // Compare against every pending sign-in without stopping at a match, so
      // the time taken doesn't tell which one matched or how many there are
      // before it.
      let match: PendingSignIn<Details> | undefined;
      for (const pending of byAccount.values()) {
        if (stateMatches(pending.state, state)) {
          match = pending;
        }
      }
      if (match === undefined) {
        return undefined;
      }
      byAccount.delete(match.accountRef);
      return isLive(match) ? match : undefined;
    },
  };
}
