import {
  accountMatches,
  type CallbackQuery,
  classifyTokenAnswer,
  clientSecretName,
  googleAuthUrl,
  type LoopbackRedirect,
  loopbackRedirectUri,
  type PendingSignIn,
  type PendingSignIns,
  readSignInCallback,
  refreshTokenName,
  type ServiceResult,
  type SetupService,
  type SignInCallback,
  signInScopes,
  type TokenAnswer,
  type TokenAnswerMeaning,
} from "@halonicjs/google-setup";
import type { Clock, HttpClient, TokenStore } from "@halonicjs/ports";
import type { RandomBytes } from "@halonicjs/std";
import { checkGoogleCheckUrl, checkServices } from "./google-check.ts";
import { readIdTokenAccount } from "./id-token.ts";
import { createPkcePair } from "./pkce.ts";
import { webRandomBytes } from "./random.ts";
import { createState } from "./state.ts";
import { postTokenForm } from "./token-request.ts";

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
  /**
   * The connector's address. It is the login hint, and Google must confirm
   * this account, or nothing is saved. Personal data: never logged.
   */
  readonly account: string;
  /**
   * The ticked services. Their scopes are asked for (`openid` and `email` are
   * always added), and each one's scopes and `googleCheck` are checked after sign-in.
   */
  readonly services: readonly SetupService[];
  /** The project ID from the setup (step 1), if known, for the "Switch it on" link. */
  readonly projectId?: string;
}

/**
 * Starts a sign-in: makes a new `state` and PKCE pair, keeps them as the
 * account's pending sign-in (replacing an earlier one) and returns the URL to
 * open in the browser. The URL holds `state` and the challenge, never the verifier.
 *
 * @param input - the account, client, redirect and services
 * @param pendingSignIns - the server's pending sign-ins
 * @param randomBytes - where `state` and the verifier come from; tests pass fixed bytes
 * @returns the auth URL
 * @throws RangeError when the account ref, client ref, redirect, a scope or a
 *   `googleCheck` URL is refused
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
  for (const service of input.services) {
    if (service.googleCheck !== undefined) {
      checkGoogleCheckUrl(service.googleCheck.url, service);
    }
  }
  const pkce = await createPkcePair(randomBytes);
  const state = createState(randomBytes);
  const scopes = signInScopes(
    input.services.flatMap((service) => service.googleScopes.map(({ scope }) => scope)),
  );
  const authUrl = googleAuthUrl({
    clientId: input.clientId,
    redirect: input.redirect,
    state,
    codeChallenge: pkce.challenge,
    scopes,
    loginHint: input.account,
  });
  pendingSignIns.start(input.accountRef, {
    state,
    codeVerifier: pkce.verifier,
    clientId: input.clientId,
    clientRef: input.clientRef,
    redirectUri: loopbackRedirectUri(input.redirect),
    scopes,
    authUrl,
    account: input.account,
    services: input.services,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
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
 * and `wrongAccount` hold an e-mail, which is personal data: log only `kind`
 * and `accountRef`.
 */
export type GoogleSignInResult =
  | {
      readonly kind: "signedIn";
      readonly accountRef: string;
      /** The e-mail Google confirmed: the connector's address. */
      readonly email: string;
      /** One check result per ticked service, in the services' order. */
      readonly services: readonly ServiceResult[];
      readonly at: Date;
    }
  | {
      /** Another Google account signed in. Nothing was saved and nothing revoked. */
      readonly kind: "wrongAccount";
      readonly accountRef: string;
      /** The address Google confirmed, for "Use … for this connector instead". */
      readonly signedInAs: string;
    }
  | Exclude<SignInCallback, { kind: "code" }>
  | FailedExchange
  | { readonly kind: "noClientSecret"; readonly accountRef: string }
  | { readonly kind: "unreachable"; readonly accountRef: string }
  | { readonly kind: "idTokenRefused"; readonly accountRef: string };

/**
 * Finishes a sign-in from Google's callback:
 * 1. finds and removes the pending sign-in by `state` and exchanges the code;
 * 2. checks the ID token, then that its verified e-mail is the connector's.
 *    For another account it returns `wrongAccount` and saves nothing. The
 *    new grant isn't revoked: that address may be another connector on the
 *    same client, and Google's revoke would end its whole grant;
 * 3. saves the refresh token under `refreshTokenName(accountRef)`, replacing
 *    an earlier one. The earlier one is never revoked either: Google's revoke
 *    ends the whole grant, so it would end the new token too;
 * 4. checks each service with the fresh access token, before the result goes
 *    back, so before any integration code runs. The access token is then
 *    dropped: it never leaves this function.
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
  const accessToken = accessTokenIn(answer.json);
  if (accessToken === undefined) {
    return { kind: "unexpectedAnswer", status: answer.status, accountRef };
  }

  const at = ports.clock.now();
  const account = readIdTokenAccount(meaning.idToken, pending.clientId, at);
  // The ID token check accepts only an address Google verified (`email_verified`),
  // so a matching address can't be claimed by another account.
  if (account === undefined) {
    return { kind: "idTokenRefused", accountRef };
  }
  if (!accountMatches(pending.account, account.email)) {
    return { kind: "wrongAccount", accountRef, signedInAs: account.email };
  }
  await ports.tokens.set(refreshTokenName(accountRef), meaning.refreshToken);
  const services = await checkServices(
    pending.services,
    meaning.grantedScopes,
    accessToken,
    pending.projectId,
    ports,
  );
  return { kind: "signedIn", accountRef, email: account.email, services, at };
}

/**
 * The access token from a token answer `classifyTokenAnswer` accepted. Core
 * leaves it out on purpose, so it is read here, where the checks use it.
 */
function accessTokenIn(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) {
    return undefined;
  }
  const value = (json as Record<string, unknown>)["access_token"];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Sends the code to Google's token endpoint (see `postTokenForm`). */
function exchangeCode(
  http: HttpClient,
  code: string,
  clientSecret: string,
  pending: PendingSignIn,
): Promise<TokenAnswer | undefined> {
  return postTokenForm(http, {
    grant_type: "authorization_code",
    code,
    client_id: pending.clientId,
    client_secret: clientSecret,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.codeVerifier,
  });
}
