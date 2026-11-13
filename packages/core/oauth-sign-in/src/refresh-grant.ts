import type { HttpClient } from "@halonicjs/ports";
import { type OAuthClient, withClientAuth } from "./client-auth.ts";
import { type RefreshAnswerMeaning, readRefreshAnswer } from "./refresh-answer.ts";
import { postTokenForm } from "./token-request.ts";

/** What a refresh sends. The refresh token and the client secret are secrets. */
export interface RefreshGrant {
  /** The token endpoint of the sign-in the user approved, never one from a later sheet. */
  readonly tokenEndpoint: string;
  readonly refreshToken: string;
  readonly client: OAuthClient;
  /** Aborts the request: made by the caller, with `tokenRequestTimeoutMs` as its limit. */
  readonly signal: AbortSignal;
}

/** What a refresh gave: the answer's meaning, or that the provider couldn't be reached. */
export type RefreshResult = RefreshAnswerMeaning | { readonly kind: "unreachable" };

/**
 * Asks the token endpoint for a new access token with the refresh token
 * (RFC 6749, section 6). Redirects are refused, because one would send the
 * refresh token and the client secret to another address.
 *
 * @param http - the server's `HttpClient`
 * @param grant - the endpoint, refresh token and client
 * @returns what the answer means. `unreachable` carries nothing: the
 *   `HttpClient`'s error can hold the request
 */
export async function refreshAccessToken(
  http: HttpClient,
  grant: RefreshGrant,
): Promise<RefreshResult> {
  const { form, headers } = withClientAuth(grant.client, {
    grant_type: "refresh_token",
    refresh_token: grant.refreshToken,
  });
  const answer = await postTokenForm(http, grant.tokenEndpoint, form, grant.signal, headers);
  return answer === undefined ? { kind: "unreachable" } : readRefreshAnswer(answer);
}
