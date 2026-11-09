import { safeGoogleErrorCode } from "./google-error-code.ts";
import type { TokenAnswer } from "./token-answer.ts";

/**
 * What Google's answer to a token refresh (`grant_type=refresh_token`) means.
 * Only `refreshed` holds secrets; like the sign-in's `tokens`, it stays in the
 * host package. Every other kind is safe to show and to log: it carries at
 * most Google's error code and the status.
 */
export type RefreshAnswerMeaning =
  | {
      readonly kind: "refreshed";
      readonly accessToken: string;
      /** Seconds until the access token expires, as Google counts them. */
      readonly expiresIn: number;
      /**
       * A new refresh token, when Google sent one. Google may rotate it; the
       * host then stores this one in place of the old one.
       */
      readonly refreshToken?: string;
      /**
       * The scopes Google granted, when it sent `scope`. It can be smaller than
       * at sign-in when the user removed some access in their Google account.
       */
      readonly grantedScopes?: readonly string[];
    }
  /** `invalid_grant`: the refresh token no longer works, so the user signs in again. */
  | { readonly kind: "signInRefused" }
  /** `invalid_client`: Google no longer accepts the client secret, or the client is gone. */
  | { readonly kind: "clientRefused" }
  | { readonly kind: "googleError"; readonly errorCode: string; readonly status: number }
  | { readonly kind: "unexpectedAnswer"; readonly status: number };

/** A refusal of the refresh itself, which the connector state is made from. */
export type RefreshRefusal = Extract<
  RefreshAnswerMeaning,
  { readonly kind: "signInRefused" | "clientRefused" }
>;

/** A non-empty string field of a JSON object, or `undefined`. */
function textField(json: Record<string, unknown>, name: string): string | undefined {
  const value = json[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** A positive, finite number field of a JSON object, or `undefined`. */
function positiveNumberField(json: Record<string, unknown>, name: string): number | undefined {
  const value = json[name];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Reads Google's answer to a token refresh (design 5.2).
 * - `invalid_grant` is `signInRefused`; `invalid_client` is `clientRefused`;
 * - any other error is `googleError` with Google's code and the status;
 * - an answer that isn't a JSON object, or a success without an access token
 *   or a positive `expires_in`, is `unexpectedAnswer`.
 * Google's `error_description` is never read, because it can echo the request,
 * and with it the refresh token or the client secret.
 *
 * @param answer - the status and the parsed body
 * @returns what the answer means
 */
export function readRefreshAnswer(answer: TokenAnswer): RefreshAnswerMeaning {
  const { status, json } = answer;
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { kind: "unexpectedAnswer", status };
  }
  const fields = json as Record<string, unknown>;

  if (status < 200 || status > 299 || "error" in fields) {
    const errorCode = safeGoogleErrorCode(fields["error"]);
    if (errorCode === "invalid_grant") {
      return { kind: "signInRefused" };
    }
    if (errorCode === "invalid_client") {
      return { kind: "clientRefused" };
    }
    return { kind: "googleError", errorCode, status };
  }

  const accessToken = textField(fields, "access_token");
  const expiresIn = positiveNumberField(fields, "expires_in");
  if (accessToken === undefined || expiresIn === undefined) {
    return { kind: "unexpectedAnswer", status };
  }
  const refreshToken = textField(fields, "refresh_token");
  const scope = textField(fields, "scope");
  return {
    kind: "refreshed",
    accessToken,
    expiresIn,
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(scope === undefined ? {} : { grantedScopes: scope.split(" ").filter(Boolean) }),
  };
}
