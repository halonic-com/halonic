import { refreshTokenName } from "@halonicjs/google-setup";
import type { HttpClient, TokenStore } from "@halonicjs/ports";
import { googleTokenTimeoutMs } from "./token-request.ts";

/** Google's endpoint for revoking a token. */
export const googleRevokeEndpoint = "https://oauth2.googleapis.com/revoke";

/** How a disconnect ended. Neither kind holds the token. */
export type GoogleRevokeResult =
  | { readonly kind: "nothingToRevoke" }
  /** The refresh token is gone from the store. `googleConfirmed` is false when Google didn't answer 200. */
  | { readonly kind: "disconnected"; readonly googleConfirmed: boolean };

/**
 * Disconnects a Google account: asks Google to revoke its refresh token and
 * removes the token from the store, whether Google answers or not.
 *
 * Google's revoke ends every token of this account under this client ID. If
 * two integrations ever share a client ID for one account (HAL-411),
 * disconnecting one also breaks the other. Removing the client secret stays
 * with A1's `removeClientSecret`.
 *
 * @param accountRef - the account ref from the setup record
 * @param ports - the `HttpClient` and the `TokenStore`
 * @returns whether there was a token, and whether Google confirmed the revoke
 * @throws RangeError when the account ref is refused
 */
export async function revokeGoogleSignIn(
  accountRef: string,
  ports: { readonly http: HttpClient; readonly tokens: TokenStore },
): Promise<GoogleRevokeResult> {
  const name = refreshTokenName(accountRef);
  const refreshToken = await ports.tokens.get(name);
  if (refreshToken === null) {
    return { kind: "nothingToRevoke" };
  }
  let googleConfirmed = false;
  try {
    // The token goes in the form body, never in the URL, where logs would keep it.
    const response = await ports.http.fetch(googleRevokeEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
      // A redirect would send the refresh token to another address; a stalled answer must not hang a disconnect.
      redirect: "error",
      signal: AbortSignal.timeout(googleTokenTimeoutMs),
    });
    googleConfirmed = response.status === 200;
  } catch {
    // Unreachable: the token is still removed below, and the result says Google didn't confirm.
  }
  await ports.tokens.remove(name);
  return { kind: "disconnected", googleConfirmed };
}
