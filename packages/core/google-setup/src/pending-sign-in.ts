/** How long a sign-in may wait for Google's callback: 10 minutes (plan D5). */
export const pendingSignInLifetimeMs = 10 * 60 * 1000;

/**
 * What a sign-in keeps while the browser is at Google. It holds the PKCE
 * verifier, so it lives in memory only and is never written to any store
 * (plan D5): the record store only appends, so a stored verifier would stay
 * in its history for good. It never holds the client secret.
 */
export interface PendingSignInDetails {
  /** The sign-in's `state`; the callback finds the sign-in by it. */
  readonly state: string;
  /** The PKCE verifier. A secret: it goes only to Google's token endpoint. */
  readonly codeVerifier: string;
  /** The redirect URI from the auth URL; the token request must repeat it. */
  readonly redirectUri: string;
  /** The scopes the auth URL asked for. */
  readonly scopes: readonly string[];
  /**
   * The auth URL this sign-in sent the browser to. "Open again" sends the
   * browser to the same URL, so the first tab's callback still works (plan
   * D7). It holds `state` and the PKCE challenge, never the verifier.
   */
  readonly authUrl: string;
}

/** A pending sign-in as `PendingSignIns.take` returns it. */
export interface PendingSignIn extends PendingSignInDetails {
  /** The account ref from the setup record. */
  readonly accountRef: string;
  /** When the sign-in started, from the `Clock`. */
  readonly startedAt: Date;
}

/**
 * The pending sign-ins of one server. The host creates one instance per
 * server and passes it in like a port, so nothing lives in module memory.
 * There is at most one per account.
 */
export interface PendingSignIns {
  /**
   * Keeps a new pending sign-in for an account, replacing any earlier one for
   * the same account, whose `state` then matches nothing.
   *
   * @param accountRef - the account ref from the setup record
   * @param pending - the `state`, verifier, redirect URI and scopes
   */
  start(accountRef: string, pending: PendingSignInDetails): void;
  /**
   * The auth URL of the account's pending sign-in, for "Open again" (plan
   * D7). Reusing it keeps the same `state` and verifier, so a callback from
   * either tab can finish the sign-in. Nothing is removed.
   *
   * @param accountRef - the account ref from the setup record
   * @returns the auth URL, or `undefined` when there is none or it has expired
   */
  authUrlFor(accountRef: string): string | undefined;
  /**
   * Drops the account's pending sign-in, for "Cancel" (plan D7). Its `state`
   * then matches nothing. Does nothing when there is none.
   *
   * @param accountRef - the account ref from the setup record
   */
  cancel(accountRef: string): void;
  /**
   * Finds the pending sign-in whose `state` equals `state` (compared in
   * constant time) and removes it, so a second callback with the same `state`
   * finds nothing. An expired one counts as none. Pending sign-ins that don't
   * match stay as they are.
   *
   * @param state - the `state` from the callback
   * @returns the sign-in, or `undefined` when none matches or it has expired
   */
  take(state: string): PendingSignIn | undefined;
}

/**
 * Whether a pending sign-in is too old to finish: 10 minutes or more after
 * its start.
 *
 * @param pending - the pending sign-in
 * @param now - the current time, from the `Clock`
 * @returns true when it has expired
 */
export function hasPendingSignInExpired(
  pending: Pick<PendingSignIn, "startedAt">,
  now: Date,
): boolean {
  return now.getTime() - pending.startedAt.getTime() >= pendingSignInLifetimeMs;
}
