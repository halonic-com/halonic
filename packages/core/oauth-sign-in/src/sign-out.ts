import type { HttpClient, Secrets } from "@halonicjs/ports";
import { type ApprovedSignIn, revokeWouldEndGrantOf } from "./approved-sign-in.ts";
import { type RevokeResult, revokeToken } from "./revoke-token.ts";
import type { SignInGrants } from "./sign-in-grants.ts";

/** What `signOut` needs. */
export interface SignOutSettings {
  /** The integration the sign-in belongs to, as its sheet names it. */
  readonly integration: string;
  readonly grants: SignInGrants;
  /** The server's `HttpClient`: https only, no redirects, a limited answer. */
  readonly http: HttpClient;
  /** Where the client secrets are, by the name in the approved sign-in. */
  readonly secrets: Secrets;
  /** A new signal that aborts after `tokenRequestTimeoutMs`: a core package has no timers. */
  requestSignal(): AbortSignal;
}

/**
 * How a sign-out ended. The grant is gone in every `signedOut` case; `revoke`
 * says what the server did about its copy.
 * - `revoked`: the server answered 200.
 * - `notConfirmed`: the server didn't answer 200 or couldn't be reached, or
 *   its client secret is missing. The refresh token may still work there.
 * - `noRevokeUrl`: the approved sign-in has no revoke endpoint.
 * - `skipped`: the server's revoke would have ended the grant that replaces this one,
 *   so nothing was sent. The refresh token may still work there, as for `notConfirmed`.
 */
export type SignOutResult =
  | { readonly kind: "notSignedIn" }
  | {
      readonly kind: "signedOut";
      readonly revoke: RevokeResult["kind"] | "noRevokeUrl" | "skipped";
    };

/**
 * Signs a sign-in out: revokes its refresh token at the revoke endpoint the
 * user approved, then removes the grant. It uses the approved sign-in saved
 * with the grant, never the sheet's, so a changed sheet can't send the token
 * to another address, and it works when the sheet no longer has the sign-in.
 * The grant is removed even when the revoke fails; the caller tells the user
 * if the server didn't confirm.
 *
 * @param settings - the integration, the grant store and the ports
 * @param signIn - the sign-in's name in the sheet
 * @param replacedBy - the sign-in whose new grant takes this one's place, when there is one: a server whose revoke ends every grant of the client is not asked, as that would end the new grant too
 * @returns whether anything was signed in, and what the server did
 *
 * @example
 * const result = await signOut({ integration: "gitlab", grants, http, secrets, requestSignal }, "work-account");
 */
export async function signOut(
  settings: SignOutSettings,
  signIn: string,
  replacedBy?: ApprovedSignIn,
): Promise<SignOutResult> {
  const grant = await settings.grants.find(settings.integration, signIn);
  if (grant === undefined) {
    return { kind: "notSignedIn" };
  }
  const { approved } = grant;
  const revoke = await revokeUnlessUseless(settings, grant.refreshToken, approved, replacedBy);
  await settings.grants.remove(settings.integration, signIn);
  return { kind: "signedOut", revoke };
}

/** Revokes at the approved URL, unless there is none or the revoke would end the grant that replaces this one. */
async function revokeUnlessUseless(
  settings: SignOutSettings,
  refreshToken: string,
  approved: ApprovedSignIn,
  replacedBy: ApprovedSignIn | undefined,
): Promise<Extract<SignOutResult, { kind: "signedOut" }>["revoke"]> {
  if (approved.revokeUrl === undefined) {
    return "noRevokeUrl";
  }
  if (replacedBy !== undefined && revokeWouldEndGrantOf(approved, replacedBy)) {
    return "skipped";
  }
  return await revokeAtApprovedUrl(settings, approved, approved.revokeUrl, refreshToken);
}

async function revokeAtApprovedUrl(
  settings: SignOutSettings,
  approved: ApprovedSignIn,
  revokeUrl: string,
  refreshToken: string,
): Promise<RevokeResult["kind"]> {
  let clientSecret: string | undefined;
  if (approved.clientSecretName !== undefined) {
    const secret = await settings.secrets.get(approved.clientSecretName);
    if (secret === null) {
      return "notConfirmed";
    }
    clientSecret = secret;
  }
  const result = await revokeToken(settings.http, {
    revokeUrl,
    token: refreshToken,
    client: {
      clientId: approved.clientId,
      clientAuth: approved.clientAuth,
      ...(clientSecret === undefined ? {} : { clientSecret }),
    },
    signal: settings.requestSignal(),
  });
  return result.kind;
}
