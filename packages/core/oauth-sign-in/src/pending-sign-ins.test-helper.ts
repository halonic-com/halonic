import {
  hasPendingSignInExpired,
  type PendingSignIn,
  type PendingSignInDetails,
  type PendingSignIns,
} from "./pending-sign-in.ts";

/**
 * A small in-test `PendingSignIns`, so the callback can be tested without the
 * host. The real one (`createPendingSignIns`) compares `state` in
 * constant time; this test double doesn't need to.
 */
export function testPendingSignIns(now: () => Date): PendingSignIns & {
  readonly size: () => number;
} {
  const byAccount = new Map<string, PendingSignIn>();
  return {
    start(accountRef: string, pending: PendingSignInDetails): void {
      byAccount.set(accountRef, { ...pending, accountRef, startedAt: now() });
    },
    authUrlFor(accountRef: string): string | undefined {
      const pending = byAccount.get(accountRef);
      if (pending === undefined || hasPendingSignInExpired(pending, now())) {
        return undefined;
      }
      return pending.authUrl;
    },
    cancel(accountRef: string): void {
      byAccount.delete(accountRef);
    },
    take(state: string): PendingSignIn | undefined {
      for (const [accountRef, pending] of byAccount) {
        if (pending.state === state) {
          byAccount.delete(accountRef);
          return hasPendingSignInExpired(pending, now()) ? undefined : pending;
        }
      }
      return undefined;
    },
    size: () => byAccount.size,
  };
}

/** Fake values for a pending sign-in. None is real. */
export const fakePending: PendingSignInDetails = {
  state: "fake-state-0000000000000000000000000000000",
  codeVerifier: "fake-verifier-00000000000000000000000000000",
  clientId: "fake-client.apps.example.com",
  clientRef: "client_fake1",
  redirectUri: "http://127.0.0.1:8787/oauth/callback",
  scopes: ["profile"],
  authUrl: "https://auth.example.com/authorize?state=fake-state-0000000000000000000000000000000",
};
