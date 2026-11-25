import type { CloudAppSession } from "./cloud-sign-in-api.ts";

/** The cookie that holds Cloud's refresh credential. */
export const refreshCookieName = "__Host-halonic-refresh";
/** Host-only cookies need this prefix; without it a sibling host could set the session cookie. */
export const hostOnlyCookiePrefix = "__Host-";

/**
 * What a token or refresh credential may hold to be written into a cookie: the base64url and
 * token characters, at most 8 KiB, so Cloud's answer can never add an attribute or a header.
 */
const cookieValuePattern = /^[A-Za-z0-9\-._~+/]{1,8192}=*$/;
/** Every cookie of Cloud sign-in is host-only, on every path, over HTTPS, out of scripts' reach. */
export const cookieAttributes = "Path=/; Secure; HttpOnly";

/** Whether Cloud's session answer can be written into cookies as it is. */
export function fitsInCookies(session: CloudAppSession): boolean {
  return (
    cookieValuePattern.test(session.token) && cookieValuePattern.test(session.refreshCredential)
  );
}

/**
 * The two `Set-Cookie` lines that keep a session: the token in the server's session cookie until
 * the token ends, and the refresh credential until the session ends. Both replace older ones.
 */
export function sessionCookies(
  session: CloudAppSession,
  sessionCookieName: string,
  nowMs: number,
): string[] {
  return [
    strictCookie(sessionCookieName, session.token, secondsUntil(session.tokenEndsAt, nowMs)),
    strictCookie(
      refreshCookieName,
      session.refreshCredential,
      secondsUntil(session.sessionEndsAt, nowMs),
    ),
  ];
}

/** The two `Set-Cookie` lines that clear a session's cookies. */
export function clearedSessionCookies(sessionCookieName: string): string[] {
  return [strictCookie(sessionCookieName, "", 0), strictCookie(refreshCookieName, "", 0)];
}

function strictCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; ${cookieAttributes}; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

/** Whole seconds from `nowMs` to `endMs`, never below 0. */
function secondsUntil(endMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((endMs - nowMs) / 1000));
}
