import {
  baseSignInScopes,
  type CallbackQuery,
  classifyTokenAnswer,
  clientSecretName,
  googleAuthUrl,
  googleTokenEndpoint,
  type LoopbackRedirect,
  loopbackRedirectUri,
  type PendingSignIn,
  type PendingSignIns,
  readSignInCallback,
  refreshTokenName,
  type SignInCallback,
  signInScopes,
  type TokenAnswer,
  type TokenAnswerMeaning,
} from "@halonicjs/google-setup";
import type { Clock, HttpClient, TokenStore } from "@halonicjs/ports";
import type { RandomBytes } from "@halonicjs/std";
import { readIdTokenAccount } from "./id-token.ts";
import { createPkcePair } from "./pkce.ts";
import { webRandomBytes } from "./random.ts";
import { createState } from "./state.ts";

/** What a sign-in starts from. Nothing here is a secret. */
export interface StartGoogleSignInInput {
  /** The account ref from the setup record. Never an e-mail address. */
  readonly accountRef: string;
  /** The OAuth client ID from the setup record. */
  readonly clientId: string;
  /** The ref of that client's secret, read only when the code is exchanged. */
  readonly clientRef: string;
  /** The local server's port and callback path. */
  readonly redirect: LoopbackRedirect;
  /** The scopes of the ticked services; `openid` and `email` are always added. */
  readonly scopes: readonly string[];
  /** The account's e-mail from the connector settings, when it is known. Only a hint. */
  readonly loginHint?: string;
}

/**
 * Starts a sign-in: makes a new `state` and PKCE pair, keeps them as the
 * account's pending sign-in (replacing an earlier one) and returns the URL to
 * open in the browser. The URL holds `state` and the challenge, never the verifier.
 *
 * @param input - the account, client, redirect, scopes and optional hint
 * @param pendingSignIns - the server's pending sign-ins
 * @param randomBytes - where `state` and the verifier come from; tests pass fixed bytes
 * @returns the auth URL
 * @throws RangeError when the account ref, client ref, redirect or a scope is refused
 */
export async function startGoogleSignIn(
  input: StartGoogleSignInInput,
  pendingSignIns: PendingSignIns,
  randomBytes: RandomBytes = webRandomBytes,
): Promise<string> {
  // The client secret is read and the refresh token saved under these names at the end.
  // A bad ref fails now, not after the user has been through Google's consent screen.
  refreshTokenName(input.accountRef);
  clientSecretName(input.clientRef);
  const pkce = await createPkcePair(randomBytes);
  const state = createState(randomBytes);
  const scopes = signInScopes(input.scopes);
  const authUrl = googleAuthUrl({
    clientId: input.clientId,
    redirect: input.redirect,
    state,
    codeChallenge: pkce.challenge,
    scopes,
    ...(input.loginHint === undefined ? {} : { loginHint: input.loginHint }),
  });
  pendingSignIns.start(input.accountRef, {
    state,
    codeVerifier: pkce.verifier,
    clientId: input.clientId,
    clientRef: input.clientRef,
    redirectUri: loopbackRedirectUri(input.redirect),
    scopes,
    authUrl,
  });
  return authUrl;
}

/** What finishing a sign-in needs from the server. */
export interface FinishGoogleSignInPorts {
  readonly pendingSignIns: PendingSignIns;
  readonly http: HttpClient;
  readonly tokens: TokenStore;
  readonly clock: Clock;
  /** Reads a client secret by its ref: A1's client secret store. `null` when there is none. */
  readonly readClientSecret: (clientRef: string) => Promise<string | null>;
}

/** A token answer that didn't give tokens, for the account that signed in. */
type FailedExchange = Exclude<TokenAnswerMeaning, { kind: "tokens" }> & {
  readonly accountRef: string;
};

/**
 * How a sign-in ended. No kind holds a secret: not the code, the verifier,
 * the client secret or any token, and an error carries Google's error code at
 * most. So every result is safe to show and return from a route. `signedIn`
 * holds the e-mail, which is personal data: log only `kind` and `accountRef`.
 */
export type GoogleSignInResult =
  | {
      readonly kind: "signedIn";
      readonly accountRef: string;
      /** The e-mail Google confirmed. It may differ from the `login_hint`. */
      readonly email: string;
      /** The scopes Google granted, from its answer. */
      readonly grantedScopes: readonly string[];
      /** The scopes asked for but not granted, because the user unticked them. */
      readonly missingScopes: readonly string[];
      readonly at: Date;
    }
  | Exclude<SignInCallback, { kind: "code" }>
  | FailedExchange
  | { readonly kind: "noClientSecret"; readonly accountRef: string }
  | { readonly kind: "unreachable"; readonly accountRef: string }
  | { readonly kind: "idTokenRefused"; readonly accountRef: string };

/**
 * Finishes a sign-in from Google's callback: finds and removes the pending
 * sign-in by `state`, exchanges the code, checks the ID token and saves the
 * refresh token under `refreshTokenName(accountRef)`, replacing an earlier
 * one. The earlier one is never revoked: Google's revoke ends the whole
 * grant, so it would end the new token too. The access token is dropped.
 *
 * @param query - the callback's query parameters
 * @param ports - the pending sign-ins, `HttpClient`, `TokenStore`, `Clock` and secret reader
 * @returns how the sign-in ended
 */
export async function finishGoogleSignIn(
  query: CallbackQuery,
  ports: FinishGoogleSignInPorts,
): Promise<GoogleSignInResult> {
  const callback = readSignInCallback(query, ports.pendingSignIns);
  if (callback.kind !== "code") {
    return callback;
  }
  const { code, pending } = callback;
  const { accountRef } = pending;

  const clientSecret = await ports.readClientSecret(pending.clientRef);
  if (clientSecret === null) {
    return { kind: "noClientSecret", accountRef };
  }
  const answer = await exchangeCode(ports.http, code, clientSecret, pending);
  if (answer === undefined) {
    return { kind: "unreachable", accountRef };
  }
  const meaning = classifyTokenAnswer(answer);
  if (meaning.kind !== "tokens") {
    return { ...meaning, accountRef };
  }

  const at = ports.clock.now();
  const account = readIdTokenAccount(meaning.idToken, pending.clientId, at);
  if (account === undefined) {
    return { kind: "idTokenRefused", accountRef };
  }
  await ports.tokens.set(refreshTokenName(accountRef), meaning.refreshToken);
  return {
    kind: "signedIn",
    accountRef,
    email: account.email,
    grantedScopes: meaning.grantedScopes,
    missingScopes: missingServiceScopes(pending.scopes, meaning.grantedScopes),
    at,
  };
}

/**
 * The services' scopes that were asked for and not granted. `openid` and
 * `email` are left out: Google reports `email` back as `…/userinfo.email`, and
 * the ID token check already proves both were granted.
 */
function missingServiceScopes(requested: readonly string[], granted: readonly string[]): string[] {
  return requested.filter((scope) => !baseSignInScopes.includes(scope) && !granted.includes(scope));
}

/**
 * Sends the code to Google's token endpoint. The secrets go in the form body
 * only, never in the URL.
 *
 * @returns the status and parsed body, or `undefined` when Google couldn't be
 *   reached. The `HttpClient`'s error is dropped, never passed on: it can
 *   carry the request.
 */
async function exchangeCode(
  http: HttpClient,
  code: string,
  clientSecret: string,
  pending: PendingSignIn,
): Promise<TokenAnswer | undefined> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: pending.clientId,
    client_secret: clientSecret,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.codeVerifier,
  });
  try {
    const response = await http.fetch(googleTokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    return { status: response.status, json: parseJson(await response.text()) };
  } catch {
    return undefined;
  }
}

/** The text as JSON, or `undefined` when it isn't JSON (an HTML error page, say). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
