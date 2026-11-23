import { type CheckedSession, checkClaims, type SessionClaims } from "./principal.ts";

/** A session token as the request carried it: in the session cookie or as a bearer token. */
export interface SessionCredential {
  readonly kind: "cookie" | "bearer";
  readonly token: string;
}

/**
 * Checks a session token and decodes its claims. A verifier checks the signature against a key
 * it trusts, the expiry and revocation; it must never trust a header or a claim it hasn't
 * verified. It doesn't decide who the principal is: the server runs {@link checkClaims} on every
 * result, so no verifier can skip those rules.
 */
export interface SessionVerifier {
  /**
   * The token's claims, or `null` when the token is refused. A verifier that can't decide (its
   * key store is down, say) throws instead, so the failure is never read as "not signed in".
   */
  verify(credential: SessionCredential): Promise<SessionClaims | null>;
}

/**
 * Marks a verifier made for tests, which checks no signature. A many-user server refuses to
 * start with one, so a test verifier can never guard a real deployment. It is a registered
 * symbol, so a test verifier in any package can carry the same mark.
 */
export const testOnlyVerifierMark: unique symbol = Symbol.for("halonic.test-only-session-verifier");

/** Whether `verifier` says it was made for tests only. */
export function isTestOnlyVerifier(verifier: SessionVerifier): boolean {
  return testOnlyVerifierMark in verifier;
}

/** Why a request has no session: none sent, two kinds or copies sent, or one that was refused. */
export type SessionRefusal = "none" | "ambiguous" | "refused";

/** What {@link verifySession} found. */
export type SessionResult =
  | { readonly ok: true; readonly session: CheckedSession }
  | { readonly ok: false; readonly refusal: SessionRefusal };

/** A bearer token: the `b64token` characters of RFC 6750, at most 8 KiB. */
const bearerPattern = /^Bearer ([A-Za-z0-9\-._~+/]{1,8192}=*)$/i;

/**
 * Finds the session token in the request's headers: the cookie named `cookieName`, or the
 * `Authorization: Bearer` header. Never the address, so a token in a query string is ignored
 * and the request counts as not signed in. A request with both kinds, two cookies of that name,
 * or an `Authorization` header that isn't one well-formed bearer token is refused, so one
 * request never mixes two credentials.
 */
export function readSessionCredential(
  request: Request,
  cookieName: string,
): SessionCredential | SessionRefusal {
  const cookies = cookieValues(request.headers.get("cookie"), cookieName);
  const authorization = request.headers.get("authorization");
  if (cookies.length > 1 || (cookies.length === 1 && authorization !== null)) {
    return "ambiguous";
  }
  if (authorization !== null) {
    const token = bearerPattern.exec(authorization)?.[1];
    return token === undefined ? "refused" : { kind: "bearer", token };
  }
  const cookie = cookies[0];
  if (cookie === undefined) {
    return "none";
  }
  return cookie === "" ? "refused" : { kind: "cookie", token: cookie };
}

/**
 * Who is asking: reads the credential, lets the verifier check it, then runs the shared claim
 * checks on what the verifier returned. Every refusal gets the same answer from the caller, so
 * the refusal kind is for the server's log only. An error the verifier throws isn't a refusal:
 * it goes up to the caller as a server error.
 */
export async function verifySession(
  request: Request,
  options: { readonly verifier: SessionVerifier; readonly cookieName: string },
): Promise<SessionResult> {
  const credential = readSessionCredential(request, options.cookieName);
  if (typeof credential === "string") {
    return { ok: false, refusal: credential };
  }
  const claims = await options.verifier.verify(credential);
  const session = claims === null ? null : checkClaims(claims);
  return session === null ? { ok: false, refusal: "refused" } : { ok: true, session };
}

/** Every value of the cookie named `name` in a `Cookie` header, in order. */
export function cookieValues(header: string | null, name: string): string[] {
  const values: string[] = [];
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      values.push(part.slice(separator + 1).trim());
    }
  }
  return values;
}
