// The words of a plugin's sign-ins, as the board approved them on HAL-8619
// (HAL-984 design section 6). Lines the approval didn't word (a few outcome
// lines and the settings line) were decided by the team with the designer
// on HAL-13419 and are listed on HAL-8613 (HAL-2282 rule). The plugin's own text
// (its name, a purpose, a scope's reason) is only ever a value here.

import { signInTokenHostWarning, signInTrustLine } from "@halonicjs/app";
import type { SignInFacts } from "./sign-in-facts.ts";

/** The section's heading on the plugin page, next to Settings. */
export const SIGN_INS_HEADING = "Sign-ins";

export const SIGN_IN = "Sign in";
export const SIGNED_IN = "Signed in";
export const SIGN_OUT = "Sign out";
export const SIGN_IN_AGAIN = "Sign in again";

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

/**
 * The trust check line, shown before **Sign in**: "Signs in to your Acme
 * account at auth.example.com. Halonic gets the tokens from
 * auth.example.com. It can: read your projects. The sign-in is used only
 * with api.example.com." The trust check shows the same line (core's
 * `signInTrustLine`).
 *
 * @param service - the plugin's name
 */
export function trustLine(service: string, facts: SignInFacts): string {
  return signInTrustLine(service, facts);
}

/** The token host warning, when the sign-in page and the token address are different services. */
export function tokenHostWarning(facts: SignInFacts): string {
  return signInTokenHostWarning(facts);
}

/** Why **Sign in again** shows: the saved sign-in is for one the person no longer sees. */
export const SIGN_IN_CHANGED = "This integration's sign-in changed since you approved it.";

/** A setting the sign-in reads is missing or wrong, so it can't start (team wording). */
export const SETTINGS_NEEDED =
  "This sign-in needs a setting that's missing or not valid. Check Settings.";

/**
 * After **Sign out**, when the provider didn't confirm the revoke, or there
 * was no address to revoke at.
 *
 * @param service - the plugin's name
 */
export function signedOutNotConfirmed(service: string): string {
  return `You're signed out here. ${service} didn't confirm, so the token may still work there until it expires.`;
}

/** The client secret a sign-in needs isn't set, in the shape of the approved refused line (team wording). */
export const CLIENT_SECRET_NOT_SET = "The client secret is missing. Add it in Settings.";

/** The host can't take a sign-in's callback where it runs now, such as inside WSL (team wording). */
export const SIGN_IN_UNAVAILABLE_HERE =
  "Signing in doesn't work here yet: Halonic can't get the browser's answer where it runs now.";

/**
 * The title when reading where the sign-ins stand failed, with the reason
 * under it, as `settingsNotLoadedTitle` (team wording).
 */
export function signInsNotLoadedTitle(name: string): string {
  return `Couldn't load ${name}'s sign-ins`;
}

/** **Sign in** failed before the browser opened (team wording, microcopy 1.1 "Action failed"). */
export function signInNotStarted(reason: string): string {
  return `Couldn't start the sign-in: ${reason}`;
}

/**
 * **Sign in** didn't open the page the host answered, because it isn't on the
 * sign-in's approved host (team wording, HAL-8613, after Liam's review).
 */
export function signInPageNotApproved(approvedHost: string): string {
  return signInNotStarted(`the page to open isn't on ${approvedHost}.`);
}

/**
 * While the browser sign-in is open, next to **Cancel** (team wording, HAL-15133, in the shape of
 * the Google setup's "Waiting for Google… Finish in your browser.").
 *
 * @param service - the plugin's name
 */
export function waitingForBrowser(service: string): string {
  return `Waiting for ${service}… Finish in your browser.`;
}

/** Ends the wait for the browser and drops the pending sign-in at the host. */
export const CANCEL = "Cancel";

/** **Cancel** failed; the host may still take the browser's answer (team wording, microcopy 1.1 "Action failed"). */
export function cancelFailed(reason: string): string {
  return `Couldn't cancel the sign-in: ${reason}`;
}

/** A sign-in that didn't finish: no answer came back, or it came back incomplete or too late. */
export const SIGN_IN_NOT_FINISHED = "The sign-in didn't finish. Try again.";

/** **Sign out** failed; nothing was removed (team wording, microcopy 1.1 "Action failed"). */
export function signOutFailed(reason: string): string {
  return `Couldn't sign out: ${reason}`;
}

/**
 * How the last sign-in ended, as the host keeps it. It has the shape of the
 * agent host client's `IntegrationSignInOutcome`; none of it is a secret.
 */
export type SignInOutcome =
  | {
      readonly kind: "signedIn";
      readonly missingScopes: readonly string[];
      readonly extraScopes: readonly string[];
      readonly previousGrant?: "revoked" | "notConfirmed" | "noRevokeUrl" | "skipped" | undefined;
    }
  | {
      readonly kind:
        | "cancelled"
        | "incompleteCallback"
        | "linkNoLongerValid"
        | "issuerMismatch"
        | "signInChanged"
        | "clientSecretMissing"
        | "wrongClientSecret"
        | "codeRefused"
        | "noRefreshToken"
        | "tokenAnswerRefused"
        | "unreachable"
        | "failed";
    }
  | { readonly kind: "providerError"; readonly errorCode: string }
  | { readonly kind: "unexpectedAnswer"; readonly status: number };

/**
 * The line that says how the last sign-in ended, or `undefined` when there
 * is nothing to say: a sign-in that got exactly the access it asked for.
 *
 * @param service - the plugin's name
 */
export function outcomeLine(service: string, outcome: SignInOutcome): string | undefined {
  switch (outcome.kind) {
    case "signedIn":
      return scopesDifferLine(service, outcome.missingScopes, outcome.extraScopes);
    case "cancelled":
      return "You cancelled the sign-in.";
    case "wrongClientSecret":
      return "The client secret was refused. Check it in Settings.";
    case "providerError":
      return `${service} answered with the error ${outcome.errorCode}.`;
    case "unreachable":
      return `Couldn't reach ${service}. Check your connection and try again.`;
    case "signInChanged":
      return SIGN_IN_CHANGED;
    case "clientSecretMissing":
      return CLIENT_SECRET_NOT_SET;
    case "incompleteCallback":
    case "linkNoLongerValid":
      return SIGN_IN_NOT_FINISHED;
    case "issuerMismatch":
    case "codeRefused":
    case "noRefreshToken":
    case "tokenAnswerRefused":
    case "unexpectedAnswer":
    case "failed":
      return `The sign-in didn't finish: Halonic couldn't use ${service}'s answer.`;
  }
}

/**
 * "Acme gave a different set of access than you were asked to approve:
 * missing write, extra admin." Each part only when it has scopes.
 */
function scopesDifferLine(
  service: string,
  missing: readonly string[],
  extra: readonly string[],
): string | undefined {
  const parts = [
    ...(missing.length === 0 ? [] : [`missing ${list.format(missing)}`]),
    ...(extra.length === 0 ? [] : [`extra ${list.format(extra)}`]),
  ];
  if (parts.length === 0) return undefined;
  return `${service} gave a different set of access than you were asked to approve: ${parts.join(", ")}.`;
}
