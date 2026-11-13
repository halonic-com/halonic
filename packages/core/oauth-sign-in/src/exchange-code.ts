import type { HttpClient } from "@halonicjs/ports";
import type { TokenAnswer } from "./token-answer.ts";
import { postTokenForm } from "./token-request.ts";

/** What the code exchange sends. The client secret and the code are secrets. */
export interface CodeExchange {
  /** The provider's token endpoint, from the sign-in's own settings and never from the callback. */
  readonly tokenEndpoint: string;
  /** The authorisation code from the callback. Used once. */
  readonly code: string;
  /** The OAuth client ID the auth URL used. */
  readonly clientId: string;
  /** The client's secret, read from the store just before. */
  readonly clientSecret: string;
  /** The redirect URI the auth URL used; the provider checks it matches. */
  readonly redirectUri: string;
  /** The PKCE verifier of the pending sign-in. */
  readonly codeVerifier: string;
  /** Aborts the request: made by the caller, with `tokenRequestTimeoutMs` as its limit. */
  readonly signal: AbortSignal;
}

/**
 * Sends the code to the token endpoint (RFC 6749, section 4.1.3, with the
 * PKCE verifier of RFC 7636), with the client secret in the form body.
 *
 * @param http - the server's `HttpClient`
 * @param exchange - the endpoint, code, client, redirect URI and verifier
 * @returns the status and parsed body, or `undefined` when the provider couldn't be reached
 */
export function exchangeAuthorizationCode(
  http: HttpClient,
  exchange: CodeExchange,
): Promise<TokenAnswer | undefined> {
  return postTokenForm(
    http,
    exchange.tokenEndpoint,
    {
      grant_type: "authorization_code",
      code: exchange.code,
      client_id: exchange.clientId,
      client_secret: exchange.clientSecret,
      redirect_uri: exchange.redirectUri,
      code_verifier: exchange.codeVerifier,
    },
    exchange.signal,
  );
}
