import type { HttpClient } from "@halonicjs/ports";
import { type OAuthClient, withClientAuth } from "./client-auth.ts";
import { postTokenForm } from "./token-request.ts";

/** What a revoke sends. The token and the client secret are secrets. */
export interface TokenRevocation {
  /** The revoke endpoint of the sign-in the user approved, never one from a later sheet. */
  readonly revokeUrl: string;
  /** The refresh token to revoke. */
  readonly token: string;
  readonly client: OAuthClient;
  /** Aborts the request: made by the caller, with `tokenRequestTimeoutMs` as its limit. */
  readonly signal: AbortSignal;
}

/** How a revoke ended. Neither kind holds the token. */
export type RevokeResult =
  /** The server answered 200. */
  | { readonly kind: "revoked" }
  /** The server didn't answer 200, or couldn't be reached. Its tokens may still work. */
  | { readonly kind: "notConfirmed" };

/**
 * Asks the server to revoke a refresh token (RFC 7009). The token goes in the
 * form body, never in the URL, and redirects are refused. Plain RFC 7009:
 * a provider that ends a whole grant with one revoke handles that itself.
 *
 * @param http - the server's `HttpClient`
 * @param revocation - the endpoint, token and client
 * @returns whether the server confirmed. The caller removes its own copy either way
 */
export async function revokeToken(
  http: HttpClient,
  revocation: TokenRevocation,
): Promise<RevokeResult> {
  const { form, headers } = withClientAuth(revocation.client, {
    token: revocation.token,
    token_type_hint: "refresh_token",
  });
  const answer = await postTokenForm(http, revocation.revokeUrl, form, revocation.signal, headers);
  return answer?.status === 200 ? { kind: "revoked" } : { kind: "notConfirmed" };
}
