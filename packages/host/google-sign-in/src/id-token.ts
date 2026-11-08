import { decodeUtf8, isPlainObject } from "@halonicjs/std";
import { decodeBase64url } from "./base64url.ts";

/** The two `iss` values Google's ID tokens carry. */
const googleIssuers: readonly string[] = ["https://accounts.google.com", "accounts.google.com"];

/** Who signed in, as Google confirmed it in the ID token. */
export interface SignedInAccount {
  /** The e-mail address Google verified. */
  readonly email: string;
  /** Google's stable ID for the account. Anything that keys data on the account uses this, not the e-mail. */
  readonly subject: string;
}

/**
 * The account from Google's ID token. The signature isn't checked: the token
 * came straight from Google's token endpoint over TLS, which OpenID Connect
 * allows (Core 1.0, 3.1.3.7), and the endpoint is a constant. The claims are
 * checked as agreed in HAL-718:
 * - `iss` is Google;
 * - `aud` is our client ID, or a list that holds only our client ID;
 * - `exp` is still in the future;
 * - `email_verified` is boolean `true`, and `email` and `sub` are present.
 *
 * @param idToken - the ID token from the token answer. A secret: it holds the e-mail.
 * @param clientId - the client ID the sign-in used
 * @param now - the current time, from the `Clock`
 * @returns the account, or `undefined` when the token is malformed or a check
 *   fails. Nothing says why, so no part of the token can leak through a result.
 */
export function readIdTokenAccount(
  idToken: string,
  clientId: string,
  now: Date,
): SignedInAccount | undefined {
  const claims = readClaims(idToken);
  if (claims === undefined) {
    return undefined;
  }
  const { iss, aud, exp, email, email_verified, sub } = claims;
  const trusted =
    typeof iss === "string" &&
    googleIssuers.includes(iss) &&
    isOnlyFor(aud, clientId) &&
    isInFuture(exp, now) &&
    email_verified === true;
  if (!trusted || !isFilledText(email) || !isFilledText(sub)) {
    return undefined;
  }
  return { email, subject: sub };
}

/** Whether `aud` names our client and nobody else. */
function isOnlyFor(aud: unknown, clientId: string): boolean {
  if (Array.isArray(aud)) {
    return aud.length > 0 && aud.every((audience) => audience === clientId);
  }
  return aud === clientId;
}

/** Whether `exp`, in seconds since 1970, is later than `now`. */
function isInFuture(exp: unknown, now: Date): boolean {
  return typeof exp === "number" && exp * 1000 > now.getTime();
}

function isFilledText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** The ID token's payload as a JSON object, or `undefined` when it isn't one. */
function readClaims(idToken: string): Record<string, unknown> | undefined {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  const payload = decodeBase64url(parts[1] ?? "");
  if (payload === undefined) {
    return undefined;
  }
  try {
    const claims: unknown = JSON.parse(decodeUtf8(payload));
    return isPlainObject(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
}
