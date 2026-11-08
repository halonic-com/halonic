import { safeGoogleErrorCode } from "./google-error-code.ts";

/** Google's token endpoint. A constant, so the ID token is only ever read from Google's answer. */
export const googleTokenEndpoint = "https://oauth2.googleapis.com/token";

/** Google's answer to the code exchange, as the host received it. */
export interface TokenAnswer {
  /** The HTTP status. */
  readonly status: number;
  /** The body parsed as JSON, or `undefined` when it wasn't JSON (an HTML error page, say). */
  readonly json: unknown;
}

/**
 * What the token answer means. Only `tokens` holds secrets (the refresh token
 * and the ID token); it stays in the host package. Every other kind is safe to
 * show and to log: it carries at most Google's error code and the status.
 */
export type TokenAnswerMeaning =
  | {
      readonly kind: "tokens";
      readonly refreshToken: string;
      readonly idToken: string;
      /** The scopes Google granted, from its `scope` field. The user may have unticked some. */
      readonly grantedScopes: readonly string[];
    }
  | { readonly kind: "wrongClientSecret" }
  | { readonly kind: "codeRefused" }
  | { readonly kind: "noRefreshToken" }
  | { readonly kind: "googleError"; readonly errorCode: string; readonly status: number }
  | { readonly kind: "unexpectedAnswer"; readonly status: number };

/** A non-empty string field of a JSON object, or `undefined`. */
function textField(json: Record<string, unknown>, name: string): string | undefined {
  const value = json[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Classifies Google's answer to the code exchange.
 * - `invalid_client` means the client secret is wrong (design 3.5);
 * - `invalid_grant` means the code expired or was used, so the user signs in again;
 * - a success without a refresh token is `noRefreshToken`;
 * - an answer that isn't a JSON object, or a success without an ID token or
 *   scopes, is `unexpectedAnswer`.
 * Google's `error_description` is never read, because it can echo the request.
 *
 * @param answer - the status and the parsed body
 * @returns what the answer means
 */
export function classifyTokenAnswer(answer: TokenAnswer): TokenAnswerMeaning {
  const { status, json } = answer;
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { kind: "unexpectedAnswer", status };
  }
  const fields = json as Record<string, unknown>;

  if (status < 200 || status > 299 || "error" in fields) {
    const errorCode = safeGoogleErrorCode(fields["error"]);
    if (errorCode === "invalid_client") {
      return { kind: "wrongClientSecret" };
    }
    if (errorCode === "invalid_grant") {
      return { kind: "codeRefused" };
    }
    return { kind: "googleError", errorCode, status };
  }

  const refreshToken = textField(fields, "refresh_token");
  const idToken = textField(fields, "id_token");
  const scope = textField(fields, "scope");
  if (idToken === undefined || scope === undefined) {
    return { kind: "unexpectedAnswer", status };
  }
  if (refreshToken === undefined) {
    return { kind: "noRefreshToken" };
  }
  return { kind: "tokens", refreshToken, idToken, grantedScopes: scope.split(" ").filter(Boolean) };
}
