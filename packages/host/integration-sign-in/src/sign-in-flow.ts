import {
  type ApprovedSignIn,
  type ApprovedSignInHash,
  approvedSignInHash,
  classifyTokenAnswer,
  createPendingSignIns,
  createPkcePair,
  createState,
  exchangeAuthorizationCode,
  hasPendingSignInExpired,
  isUsableToken,
  loopbackRedirectUri,
  type PendingSignInDetails,
  readSignInCallback,
  type SignInGrants,
  type TokenAnswer,
} from "@halonicjs/oauth-sign-in";
import type { Clock, Digest, HttpClient, Secrets } from "@halonicjs/ports";
import type { RandomBytes } from "@halonicjs/std";
import { createHttpsOnlyClient } from "./https-only-client.ts";
import type { IntegrationSignIns, SignInLookup } from "./integration-sign-ins.ts";

/** What a sign-in keeps while the browser is at the provider, on top of the generic details. */
interface IntegrationPendingDetails extends PendingSignInDetails {
  readonly signIn: string;
  /** The sign-in the user approved when it started. The exchange uses this one, never the sheet's now. */
  readonly approved: ApprovedSignIn;
  readonly approvedHash: ApprovedSignInHash;
  /** The random path of this sign-in's callback. */
  readonly callbackPath: string;
}

/** What {@link createSignInFlow} needs. */
export interface SignInFlowSettings {
  /** The integration, as its sheet names it. */
  readonly integration: string;
  /** Looks sign-ins up the way the trust check shows them, and so tells what the sheet says now. */
  readonly signIns: Pick<IntegrationSignIns, "lookUp">;
  readonly grants: SignInGrants;
  /**
   * The server's `HttpClient`: no redirects, a limited answer. The factory
   * wraps it with `createHttpsOnlyClient`, so every sign-in request goes over
   * https whatever the caller passes.
   */
  readonly http: HttpClient;
  readonly secrets: Secrets;
  readonly clock: Clock;
  readonly digest: Digest;
  readonly randomBytes: RandomBytes;
  /** A new signal that aborts after the token request's time limit. */
  requestSignal(): AbortSignal;
  /**
   * Told how each sign-in ended, so the app can show it. It never holds a
   * code or a token. It must not throw.
   */
  onOutcome?(outcome: SignInOutcome): void;
}

/** Why a sign-in could not start. Safe to show. */
export type StartResult =
  | {
      readonly kind: "started";
      /** Where to send the browser: open it with the system call that takes one URL, never through a shell. */
      readonly authorizeUrl: string;
      /** The path the provider will come back to on the local server. A new random one for each start. */
      readonly callbackPath: string;
    }
  | Exclude<SignInLookup, { readonly kind: "approvable" }>
  | { readonly kind: "clientSecretMissing" };

/**
 * How a sign-in ended. Every kind is safe to show and to log: none holds a
 * code, a token, an error description or the client secret.
 */
export type SignInOutcome =
  | {
      readonly kind: "signedIn";
      readonly signIn: string;
      /** Scopes the user was asked for and the provider didn't grant. Usually none. */
      readonly missingScopes: readonly string[];
      /** Scopes the provider granted beyond the ones asked for. Usually none. */
      readonly extraScopes: readonly string[];
    }
  | {
      readonly kind: "cancelled" | "incompleteCallback" | "linkNoLongerValid";
      readonly signIn: string;
    }
  | { readonly kind: "providerError"; readonly signIn: string; readonly errorCode: string }
  | {
      readonly kind:
        | "issuerMismatch"
        | "signInChanged"
        | "clientSecretMissing"
        | "wrongClientSecret"
        | "codeRefused"
        | "noRefreshToken"
        | "tokenAnswerRefused"
        | "unreachable"
        | "failed";
      readonly signIn: string;
    }
  | { readonly kind: "unexpectedAnswer"; readonly signIn: string; readonly status: number };

/** One integration's sign-in flow: starting one and answering the provider's callback. */
export interface SignInFlow {
  /**
   * Starts a sign-in: fills it in, keeps it as pending (replacing an earlier
   * one for the same sign-in) and builds the authorize URL.
   *
   * @param signIn - the sign-in's name in the sheet
   * @param port - the port of the local server, which listens on `127.0.0.1` only
   */
  start(signIn: string, port: number): Promise<StartResult>;
  /**
   * Answers the provider's callback with a page that never repeats what the
   * request carried. A path that isn't a pending sign-in's gets a plain 400
   * and nothing else happens.
   */
  handleCallback(request: Request): Promise<Response>;
  /** Drops a pending sign-in, for "Cancel". Its callback then gets the 400. */
  cancel(signIn: string): void;
}

/**
 * The flow of one integration's sign-ins (HAL-984 design, section 4): the
 * authorize URL, the redirect to a random path on the local server, the
 * callback and the exchange. Only the refresh token is kept; the first
 * request refreshes for its access token.
 *
 * @example
 * const flow = createSignInFlow({ integration: "gitlab", signIns, grants, http, secrets, clock, digest, randomBytes, requestSignal });
 * const started = await flow.start("work-account", server.port);
 */
export function createSignInFlow(given: SignInFlowSettings): SignInFlow {
  const settings = { ...given, http: createHttpsOnlyClient(given.http) };
  const pending = createPendingSignIns<IntegrationPendingDetails>(settings.clock);
  /** The callback paths that may still be answered, so a path is checked before `state` is read. */
  const paths = new Map<string, { readonly signIn: string; readonly startedAt: Date }>();

  function forget(signIn: string): void {
    pending.cancel(signIn);
    for (const [path, entry] of paths) {
      if (entry.signIn === signIn) paths.delete(path);
    }
  }

  function forgetExpired(): void {
    for (const [path, entry] of paths) {
      if (hasPendingSignInExpired(entry, settings.clock.now())) paths.delete(path);
    }
  }

  async function start(signIn: string, port: number): Promise<StartResult> {
    const found = await settings.signIns.lookUp(signIn);
    if (found.kind !== "approvable") {
      return found;
    }
    const approved = found.signIn;
    if (
      approved.clientSecretName !== undefined &&
      (await settings.secrets.get(approved.clientSecretName)) === null
    ) {
      return { kind: "clientSecretMissing" };
    }
    const state = createState(settings.randomBytes);
    const callbackPath = `/sign-in/${createState(settings.randomBytes)}`;
    const redirectUri = loopbackRedirectUri({ port, path: callbackPath });
    const pkce = await createPkcePair(settings.randomBytes, settings.digest);
    const authUrl = authorizeUrl(approved, { state, redirectUri, challenge: pkce.challenge });

    forget(signIn);
    forgetExpired();
    pending.start(signIn, {
      state,
      codeVerifier: pkce.verifier,
      clientId: approved.clientId,
      clientRef: approved.clientSecretName ?? "",
      redirectUri,
      scopes: approved.scopes,
      authUrl,
      signIn,
      approved,
      approvedHash: await approvedSignInHash(approved, settings.digest),
      callbackPath,
    });
    paths.set(callbackPath, { signIn, startedAt: settings.clock.now() });
    return { kind: "started", authorizeUrl: authUrl, callbackPath };
  }

  async function handleCallback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const entry = paths.get(url.pathname);
    if (request.method !== "GET" || entry === undefined) {
      return page(400, "This sign-in link is no longer valid.");
    }
    // One answer per path, whatever it carries: a second visit finds nothing.
    paths.delete(url.pathname);
    let outcome: SignInOutcome;
    try {
      outcome = await finish(url, entry.signIn);
    } catch {
      // The error is dropped on purpose: it can carry a token or a URL.
      outcome = { kind: "failed", signIn: entry.signIn };
      settings.onOutcome?.(outcome);
      return page(500, outcomeText(outcome));
    }
    settings.onOutcome?.(outcome);
    return page(outcome.kind === "signedIn" ? 200 : 400, outcomeText(outcome));
  }

  async function finish(url: URL, signIn: string): Promise<SignInOutcome> {
    const callback = readSignInCallback(url.searchParams, pending);
    switch (callback.kind) {
      case "linkNoLongerValid":
      case "cancelled":
      case "incompleteCallback":
        return { kind: callback.kind, signIn };
      case "providerError":
        return { kind: "providerError", signIn, errorCode: callback.errorCode };
      case "code":
        break;
    }
    const { pending: started } = callback;
    // Never finish a sign-in through another path than its own. `state` was
    // read first, so a callback on A's path with B's `state` also uses B up.
    // That takes B's secret `state`; the outcome is only imprecise.
    if (started.callbackPath !== url.pathname || started.signIn !== signIn) {
      return { kind: "linkNoLongerValid", signIn };
    }
    if (!issuerMatches(started.approved, url.searchParams.get("iss"))) {
      return { kind: "issuerMismatch", signIn };
    }
    // The sheet or a setting may have changed while the browser was away.
    const now = await settings.signIns.lookUp(signIn);
    if (
      now.kind !== "approvable" ||
      (await approvedSignInHash(now.signIn, settings.digest)) !== started.approvedHash
    ) {
      return { kind: "signInChanged", signIn };
    }
    return await exchange(started, callback.code);
  }

  async function exchange(
    started: IntegrationPendingDetails,
    code: string,
  ): Promise<SignInOutcome> {
    const { approved, signIn } = started;
    let clientSecret: string | undefined;
    if (approved.clientSecretName !== undefined) {
      const secret = await settings.secrets.get(approved.clientSecretName);
      if (secret === null) {
        return { kind: "clientSecretMissing", signIn };
      }
      clientSecret = secret;
    }
    const answer = await exchangeAuthorizationCode(settings.http, {
      tokenEndpoint: approved.tokenUrl,
      code,
      client: {
        clientId: approved.clientId,
        clientAuth: approved.clientAuth,
        ...(clientSecret === undefined ? {} : { clientSecret }),
      },
      redirectUri: started.redirectUri,
      codeVerifier: started.codeVerifier,
      signal: settings.requestSignal(),
    });
    if (answer === undefined) {
      return { kind: "unreachable", signIn };
    }
    const read = readTokenAnswer(answer, signIn);
    if (read.kind !== "refreshable") {
      return read;
    }
    await settings.grants.save(settings.integration, signIn, {
      refreshToken: read.refreshToken,
      approved,
    });
    return { kind: "signedIn", signIn, ...scopeDifference(started.scopes, read.grantedScopes) };
  }

  return { start, handleCallback, cancel: forget };
}

/**
 * What the token endpoint's answer to the code exchange gives: a refresh
 * token that is fit to keep, or the outcome that says why nothing is kept.
 * Only the refresh token is kept; the access token is checked and dropped.
 */
function readTokenAnswer(
  answer: TokenAnswer,
  signIn: string,
):
  | { kind: "refreshable"; refreshToken: string; grantedScopes: readonly string[] | undefined }
  | SignInOutcome {
  const meaning = classifyTokenAnswer(answer);
  switch (meaning.kind) {
    case "wrongClientSecret":
    case "codeRefused":
      return { kind: meaning.kind, signIn };
    case "providerError":
      return { kind: "providerError", signIn, errorCode: meaning.errorCode };
    case "unexpectedAnswer":
      return { kind: "unexpectedAnswer", signIn, status: meaning.status };
    case "tokens":
      break;
  }
  if (!isBearerAnswerWithToken(answer)) {
    return { kind: "tokenAnswerRefused", signIn };
  }
  if (meaning.refreshToken === undefined) {
    return { kind: "noRefreshToken", signIn };
  }
  if (!isUsableToken(meaning.refreshToken)) {
    return { kind: "tokenAnswerRefused", signIn };
  }
  return {
    kind: "refreshable",
    refreshToken: meaning.refreshToken,
    grantedScopes: meaning.grantedScopes,
  };
}

/** The authorize URL: the sheet's, with the parameters of the flow set by Halonic and by nothing else. */
function authorizeUrl(
  approved: ApprovedSignIn,
  flow: { state: string; redirectUri: string; challenge: string },
): string {
  const url = new URL(approved.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", approved.clientId);
  url.searchParams.set("redirect_uri", flow.redirectUri);
  url.searchParams.set("state", flow.state);
  url.searchParams.set("code_challenge", flow.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (approved.scopes.length > 0) {
    url.searchParams.set("scope", approved.scopes.join(" "));
  }
  return url.toString();
}

/**
 * The mix-up check (RFC 9207). With a declared `issuer` the callback must
 * carry it. Without one, an `iss` the callback carries anyway must be the
 * authorize URL's own origin.
 */
function issuerMatches(approved: ApprovedSignIn, iss: string | null): boolean {
  if (approved.issuer !== undefined) {
    return iss === approved.issuer;
  }
  return iss === null || iss === new URL(approved.authorizeUrl).origin;
}

/** `token_type` is bearer in any case and `access_token` is a token fit to be filtered. */
function isBearerAnswerWithToken(answer: TokenAnswer): boolean {
  const fields = answer.json as Record<string, unknown>;
  const type = fields["token_type"];
  return (
    typeof type === "string" &&
    type.toLowerCase() === "bearer" &&
    isUsableToken(fields["access_token"])
  );
}

function scopeDifference(
  asked: readonly string[],
  granted: readonly string[] | undefined,
): { missingScopes: readonly string[]; extraScopes: readonly string[] } {
  // A provider that doesn't say which scopes it granted granted the ones asked for (RFC 6749, section 5.1).
  if (granted === undefined) {
    return { missingScopes: [], extraScopes: [] };
  }
  return {
    missingScopes: asked.filter((scope) => !granted.includes(scope)),
    extraScopes: granted.filter((scope) => !asked.includes(scope)),
  };
}

function outcomeText(outcome: SignInOutcome): string {
  return outcome.kind === "signedIn"
    ? "You're signed in. You can close this tab and go back to Halonic."
    : "The sign-in didn't finish. Go back to Halonic to see why and to try again.";
}

/** A fixed page: it never repeats the request, so a link can't put text on it. */
function page(status: number, text: string): Response {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Halonic</title><p>${text}</p>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'",
    },
  });
}
