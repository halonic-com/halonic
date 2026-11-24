import { constantTimeEqual, encodeBase64url } from "@halonicjs/std";
import type { ErrorLog, ServerErrorBody } from "./api.ts";
import type { CloudAppSession, CloudSignInPorts } from "./cloud-sign-in-api.ts";
import { serverErrors } from "./errors.ts";
import { isHttpsOrigin } from "./https-origin.ts";
import { cookieValues } from "./session-verifier.ts";

/** Sends a browser to Cloud's sign-in page for this product. */
export const cloudSignInStartPath = "/api/sign-in";
/** Where Cloud sends the browser back with `code` and `state`. The request log leaves it out. */
export const cloudSignInReturnPath = "/api/sign-in/return";

/** The cookie that holds the `state` of the one sign-in a browser is in the middle of. */
export const signInStateCookieName = "__Host-halonic-sign-in-state";
/** The cookie that holds Cloud's refresh credential. */
export const refreshCookieName = "__Host-halonic-refresh";

/** How long a sign-in may take, the same 10 minutes Cloud gives its own attempt. */
const stateLifetimeSeconds = 10 * 60;
/** 32 random bytes, 43 base64url characters: inside the 32 to 128 Cloud accepts. */
const stateByteCount = 32;
/** Where a signed-in browser lands. Fixed, so no request can choose it. */
const afterSignInPath = "/";
/**
 * Cloud's refusals that end in a reason its sign-in page words itself, as `ended`. Cloud's page
 * shows that reason and doesn't send the browser back, so these may redirect.
 */
const endedReasonByRefusal: ReadonlyMap<string, string> = new Map([
  ["signin.user_suspended", "user_suspended"],
  ["signin.product_paused", "product_paused"],
  ["signin.user_deleted", "user_deleted"],
]);
/**
 * What a token or refresh credential may hold to be written into a cookie: the base64url and
 * token characters, at most 8 KiB, so Cloud's answer can never add an attribute or a header.
 */
/**
 * The other refusals on Cloud's fixed list, which the error answer may name. Anything else from
 * Cloud stays out of the answer.
 */
const namedRefusals: ReadonlySet<string> = new Set([
  "signin.link_expired",
  "signin.product_not_live",
]);
/** Host-only cookies need this prefix; without it a sibling host could set the session cookie. */
const hostOnlyCookiePrefix = "__Host-";
const cookieValuePattern = /^[A-Za-z0-9\-._~+/]{1,8192}=*$/;
/** Every cookie this flow sets is host-only, on every path, over HTTPS, out of scripts' reach. */
const cookieAttributes = "Path=/; Secure; HttpOnly";

/** The sign-in routes of a many-user server, before any session is needed. */
export interface CloudSignInRoutes {
  /** The answer for the start or return route, or `null` for any other request. */
  route(request: Request): Promise<Response> | null;
}

/**
 * Builds the routes that sign a customer in through Halonic Cloud. The start sends the browser to
 * Cloud with a new `state` it also keeps in a cookie. The return exchanges Cloud's one-time code
 * only when the `state` Cloud sent back matches that cookie, then keeps the session in cookies.
 */
export function createCloudSignInRoutes(
  ports: CloudSignInPorts,
  options: { readonly sessionCookieName: string; readonly errorLog: ErrorLog },
): CloudSignInRoutes {
  if (!isHttpsOrigin(ports.signInOrigin)) {
    throw new Error("The sign-in origin must be an https origin with no path.");
  }
  if (!options.sessionCookieName.startsWith(hostOnlyCookiePrefix)) {
    throw new Error(`The session cookie's name must start with ${hostOnlyCookiePrefix}.`);
  }
  const now = ports.now ?? Date.now;

  /** A fresh start: a new `state`, which also makes any older one useless. */
  function sendToSignIn(endedReason?: string): Response {
    const state = encodeBase64url(crypto.getRandomValues(new Uint8Array(stateByteCount)));
    const page = new URL("/", ports.signInOrigin);
    page.searchParams.set("product", ports.product);
    page.searchParams.set("place", "app");
    page.searchParams.set("path", cloudSignInReturnPath);
    page.searchParams.set("state", state);
    if (endedReason !== undefined) {
      page.searchParams.set("ended", endedReason);
    }
    const response = redirect(page.href);
    response.headers.append("Set-Cookie", stateCookie(state, stateLifetimeSeconds));
    return response;
  }

  /** Keeps the new session in its two cookies, replacing any older session, and clears the `state`. */
  function signedIn(session: CloudAppSession): Response {
    const response = redirect(afterSignInPath);
    const nowMs = now();
    response.headers.append(
      "Set-Cookie",
      strictCookie(
        options.sessionCookieName,
        session.token,
        secondsUntil(session.tokenEndsAt, nowMs),
      ),
    );
    response.headers.append(
      "Set-Cookie",
      strictCookie(
        refreshCookieName,
        session.refreshCredential,
        secondsUntil(session.sessionEndsAt, nowMs),
      ),
    );
    response.headers.append("Set-Cookie", stateCookie("", 0));
    return response;
  }

  /**
   * A failed return answers an error instead of a new redirect: a person already signed in at
   * Cloud would be sent straight back, so a redirect would loop. Starting again takes a click.
   */
  function signInFailed(refusal?: string): Response {
    const { status, code, message } = serverErrors.signInFailed;
    const body: ServerErrorBody & { readonly refusal?: string } =
      refusal !== undefined && namedRefusals.has(refusal)
        ? { code, message, refusal }
        : { code, message };
    const response = Response.json(body, { status });
    response.headers.append("Set-Cookie", stateCookie("", 0));
    return response;
  }

  async function finishSignIn(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const code = query.get("code");
    const sentState = query.get("state");
    const keptStates = cookieValues(request.headers.get("cookie"), signInStateCookieName);
    const keptState = keptStates.length === 1 ? keptStates[0] : undefined;
    // The code is never touched unless the state matches: a code from another browser's sign-in
    // can't start a session here.
    if (code === null || code === "" || !statesMatch(keptState, sentState)) {
      return signInFailed();
    }
    let outcome: Awaited<ReturnType<CloudSignInPorts["exchange"]>>;
    try {
      outcome = await ports.exchange(code, sentState);
    } catch (error) {
      options.errorLog.record(error);
      return signInFailed();
    }
    if (!outcome.ok) {
      const endedReason = endedReasonByRefusal.get(outcome.refusal);
      return endedReason === undefined ? signInFailed(outcome.refusal) : sendToSignIn(endedReason);
    }
    const { token, refreshCredential } = outcome.session;
    if (!cookieValuePattern.test(token) || !cookieValuePattern.test(refreshCredential)) {
      options.errorLog.record(new Error("Cloud's session answer can't be kept in a cookie."));
      return signInFailed();
    }
    return signedIn(outcome.session);
  }

  return {
    route(request) {
      if (request.method !== "GET") {
        return null;
      }
      const { pathname } = new URL(request.url);
      if (pathname === cloudSignInStartPath) {
        return Promise.resolve(sendToSignIn());
      }
      return pathname === cloudSignInReturnPath ? finishSignIn(request) : null;
    },
  };
}

/** Whether the request log must leave a path out: the return carries a one-time code. */
export function isCloudSignInReturnPath(pathname: string): boolean {
  return pathname === cloudSignInReturnPath;
}

/** Both present, not empty, and equal, compared in constant time. */
function statesMatch(kept: string | undefined, sent: string | null): sent is string {
  if (kept === undefined || kept === "" || sent === null || sent === "") {
    return false;
  }
  const encoder = new TextEncoder();
  return constantTimeEqual(encoder.encode(kept), encoder.encode(sent));
}

/** A 303, so the browser follows with a `GET` and the address bar loses the code and `state`. */
function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/** `Lax`, because the return is a top-level navigation from Cloud's host. */
function stateCookie(value: string, maxAgeSeconds: number): string {
  return `${signInStateCookieName}=${value}; ${cookieAttributes}; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function strictCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; ${cookieAttributes}; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

/** Whole seconds from `nowMs` to `endMs`, never below 0. */
function secondsUntil(endMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((endMs - nowMs) / 1000));
}
