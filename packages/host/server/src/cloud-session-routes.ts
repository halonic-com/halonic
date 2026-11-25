import type { ErrorLog, ServerErrorBody } from "./api.ts";
import {
  clearedSessionCookies,
  fitsInCookies,
  refreshCookieName,
  sessionCookies,
} from "./cloud-cookies.ts";
import type { CloudSignInPorts, RefreshOutcome } from "./cloud-sign-in-api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { cookieValues } from "./session-verifier.ts";

/** Gets a new session token and refresh credential for the session in the cookies. */
export const cloudRefreshPath = "/api/session/refresh";
/** Ends the session at Cloud and on this browser, whose cookies it clears. */
export const cloudSignOutPath = "/api/sign-out";

/** The reasons Cloud may give for a session's end, as its sign-in page reads them. */
const endedReasons: ReadonlySet<string> = new Set([
  "expired",
  "signed_out",
  "signed_out_everywhere",
  "user_suspended",
  "product_paused",
  "user_deleted",
]);

/** The refresh and sign-out routes of a many-user server with Cloud sign-in. */
export interface CloudSessionRoutes {
  /** The answer for the refresh or sign-out route, or `null` for any other request. */
  route(request: Request): Promise<Response> | null;
}

/**
 * Builds the routes that keep a Cloud session going and end it. Both are `POST` and refuse a
 * request a browser says comes from another site; the server's `Host` and `Origin` checks still
 * run first. Only these two routes read the refresh cookie.
 */
export function createCloudSessionRoutes(
  ports: CloudSignInPorts,
  options: { readonly sessionCookieName: string; readonly errorLog: ErrorLog },
): CloudSessionRoutes {
  const now = ports.now ?? Date.now;

  /** An answer that clears both cookies, so a session Cloud ended is gone here too. */
  function ended(reason: string | null): Response {
    const { status, code, message } = serverErrors.sessionEnded;
    const body: ServerErrorBody & { readonly ended?: string } =
      reason !== null && endedReasons.has(reason)
        ? { code, message, ended: reason }
        : { code, message };
    return withCookies(
      Response.json(body, { status }),
      clearedSessionCookies(options.sessionCookieName),
    );
  }

  async function refresh(request: Request): Promise<Response> {
    const credential = refreshCredentialOf(request);
    if (credential === undefined) {
      return ended(null);
    }
    let outcome: RefreshOutcome;
    try {
      outcome = await ports.refresh(credential);
    } catch (error) {
      // Cloud used nothing up, so the cookies stay and a later refresh can still work.
      options.errorLog.record(error);
      return errorResponse(serverErrors.sessionRefreshUnavailable);
    }
    if (!outcome.ok) {
      return ended(outcome.ended);
    }
    if (!fitsInCookies(outcome.session)) {
      options.errorLog.record(new Error("Cloud's session answer can't be kept in a cookie."));
      return ended(null);
    }
    const lines = sessionCookies(outcome.session, options.sessionCookieName, now());
    return withCookies(new Response(null, { status: 204 }), lines);
  }

  /**
   * Ends the session at Cloud first, so a copy of the refresh credential stops working too. The
   * cookies are cleared whatever Cloud answers: a person who signs out is signed out here even
   * while Cloud can't be reached, and the failure goes to the error log.
   */
  async function signOut(request: Request): Promise<Response> {
    const credential = refreshCredentialOf(request);
    if (credential !== undefined) {
      try {
        await ports.signOut(credential);
      } catch (error) {
        options.errorLog.record(error);
      }
    }
    return withCookies(
      new Response(null, { status: 204 }),
      clearedSessionCookies(options.sessionCookieName),
    );
  }

  return {
    route(request) {
      const { pathname } = new URL(request.url);
      if (
        request.method !== "POST" ||
        (pathname !== cloudRefreshPath && pathname !== cloudSignOutPath)
      ) {
        return null;
      }
      if (isFromOtherSite(request)) {
        return Promise.resolve(errorResponse(serverErrors.fromOtherSite));
      }
      return pathname === cloudRefreshPath ? refresh(request) : signOut(request);
    },
  };
}

/** The credential in the request's one refresh cookie, or `undefined` without exactly one, non-empty. */
function refreshCredentialOf(request: Request): string | undefined {
  const credentials = cookieValues(request.headers.get("cookie"), refreshCookieName);
  const [credential] = credentials;
  return credentials.length === 1 && credential !== "" ? credential : undefined;
}

/** Whether a browser says the request comes from another site; a script sends no such header. */
function isFromOtherSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin";
}

function withCookies(response: Response, lines: readonly string[]): Response {
  for (const line of lines) {
    response.headers.append("Set-Cookie", line);
  }
  return response;
}
