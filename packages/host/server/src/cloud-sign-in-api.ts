/**
 * A session Halonic Cloud started for a customer of the app: the token the deployment's pages
 * accept, and the credential that refreshes it. Times are milliseconds since the epoch.
 */
export interface CloudAppSession {
  readonly token: string;
  readonly tokenEndsAt: number;
  readonly refreshCredential: string;
  readonly sessionEndsAt: number;
}

/**
 * What exchanging a sign-in's one-time code gave: a new session, or Cloud's refusal code. The
 * code is Cloud's text, so the routes read it against their own fixed list and nothing else.
 */
export type CodeExchangeOutcome =
  | { readonly ok: true; readonly session: CloudAppSession }
  | { readonly ok: false; readonly refusal: string };

/**
 * What a many-user server needs to sign its customers in through Halonic Cloud. Every value
 * comes from the deployment's config, never from a request.
 */
export interface CloudSignInPorts {
  /** Cloud's sign-in origin, such as `https://signin.example.com`; `https` only. */
  readonly signInOrigin: string;
  /** This deployment's product id, which Cloud's sign-in page is opened for. */
  readonly product: string;
  /**
   * Exchanges a one-time code and its `state` server to server, signed with the deployment's
   * key. It is called at most once per code and never retried, because Cloud uses the code up on
   * the first try. It throws when Cloud can't be reached or answers anything but a session or a
   * refusal.
   */
  exchange(code: string, state: string): Promise<CodeExchangeOutcome>;
  /** The current time in milliseconds; tests pass a fixed clock. */
  readonly now?: () => number;
}
