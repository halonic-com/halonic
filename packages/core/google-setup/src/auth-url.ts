import { type LoopbackRedirect, loopbackRedirectUri } from "./loopback-redirect.ts";

/** Google's authorisation endpoint for the code flow (OpenID Connect discovery). */
export const googleAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";

/** The scopes every sign-in asks for, so the token answer carries the account's e-mail. */
export const baseSignInScopes: readonly string[] = ["openid", "email"];

/** What the auth URL is built from. Nothing here is a secret. */
export interface AuthUrlInput {
  /** The OAuth client ID from the setup record. */
  readonly clientId: string;
  /** The local server's port and callback path. */
  readonly redirect: LoopbackRedirect;
  /** The sign-in's `state`. */
  readonly state: string;
  /** The PKCE S256 challenge. Never the verifier. */
  readonly codeChallenge: string;
  /** The scopes of the ticked services; `openid` and `email` are always added. */
  readonly scopes: readonly string[];
  /**
   * The account's e-mail from the connector settings, when it is known. Only a
   * hint: Google may sign in another account. Never the account ref.
   */
  readonly loginHint?: string;
}

/**
 * The scopes a sign-in asks for: `openid`, `email` and the services' scopes,
 * sorted and without duplicates, so the same ticks always give the same URL.
 *
 * @param serviceScopes - the scopes of the ticked services
 * @returns the scopes to request
 * @throws RangeError when a scope is empty or holds whitespace, which would
 *   split it into two scopes
 */
export function signInScopes(serviceScopes: readonly string[]): string[] {
  for (const scope of serviceScopes) {
    if (scope === "" || /\s/.test(scope)) {
      throw new RangeError(`"${scope}" is not a Google scope: it is empty or holds whitespace.`);
    }
  }
  return [...new Set([...baseSignInScopes, ...serviceScopes])].sort();
}

/**
 * Google's auth URL for one sign-in: the code flow with PKCE S256, a loopback
 * redirect, and `access_type=offline` with `prompt=consent`, so every sign-in,
 * also a second one, returns a refresh token. There is no
 * `include_granted_scopes`: each integration gets a token with only its own
 * scopes (HAL-411).
 *
 * @param input - the client ID, redirect, `state`, challenge, scopes and optional hint
 * @returns the URL to open in the browser
 * @throws RangeError when the redirect or a scope is refused, or the client
 *   ID, `state` or challenge is empty
 *
 * @example
 * googleAuthUrl({ clientId, redirect: { port: 8787, path: "/google/callback" },
 *   state, codeChallenge, scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });
 */
export function googleAuthUrl(input: AuthUrlInput): string {
  for (const [name, value] of [
    ["client ID", input.clientId],
    ["state", input.state],
    ["code challenge", input.codeChallenge],
  ] as const) {
    if (value === "") {
      throw new RangeError(`The auth URL needs a ${name}.`);
    }
  }
  const parameters: [string, string][] = [
    ["response_type", "code"],
    ["client_id", input.clientId],
    ["redirect_uri", loopbackRedirectUri(input.redirect)],
    ["scope", signInScopes(input.scopes).join(" ")],
    ["state", input.state],
    ["code_challenge", input.codeChallenge],
    ["code_challenge_method", "S256"],
    ["access_type", "offline"],
    ["prompt", "consent"],
  ];
  if (input.loginHint !== undefined && input.loginHint !== "") {
    parameters.push(["login_hint", input.loginHint]);
  }
  // The core has no URLSearchParams, so the query is encoded here.
  const query = parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("&");
  return `${googleAuthEndpoint}?${query}`;
}
