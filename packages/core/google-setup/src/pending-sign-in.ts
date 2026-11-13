import {
  hasPendingSignInExpired,
  type PendingSignIn as OAuthPendingSignIn,
  type PendingSignInDetails as OAuthPendingSignInDetails,
  type PendingSignIns as OAuthPendingSignIns,
  pendingSignInLifetimeMs,
} from "@halonicjs/oauth-sign-in";
import type { SetupService } from "./setup-input.ts";

// The expiry rule is the generic flow's, not Google's.
export { hasPendingSignInExpired, pendingSignInLifetimeMs };

/**
 * What a Google sign-in keeps while the browser is at Google: the generic
 * pending sign-in (`@halonicjs/oauth-sign-in`) and what only Google's steps
 * need. The PKCE verifier is in there, so it lives in memory only and is
 * never written to any store (plan D5). It never holds the client secret.
 */
export interface PendingSignInDetails extends OAuthPendingSignInDetails {
  /**
   * The connector's address. Google must confirm this account, or nothing is
   * saved (design 3.5 point 3). Personal data: never logged.
   */
  readonly account: string;
  /** The ticked services, whose scopes and `googleCheck` are checked after sign-in. */
  readonly services: readonly SetupService[];
  /** The project ID from the setup (step 1), for the "Switch it on" link. */
  readonly projectId?: string;
}

/** A pending sign-in as `PendingSignIns.take` returns it. */
export type PendingSignIn = OAuthPendingSignIn<PendingSignInDetails>;

/** The pending sign-ins of one server: at most one per Google account. */
export type PendingSignIns = OAuthPendingSignIns<PendingSignInDetails>;
