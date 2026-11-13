import { safeOAuthErrorCode } from "./oauth-error-code.ts";
import type { TokenAnswer } from "./token-answer.ts";
import { isUsableToken } from "./usable-token.ts";

/**
 * What the provider's answer to a token refresh (`grant_type=refresh_token`)
 * means. Only `refreshed` holds secrets; it stays with the code that asked.
 * Every other kind is safe to show and to log: it carries at most the
 * provider's error code and the status.
 */
export type RefreshAnswerMeaning =
  | {
      readonly kind: "refreshed";
      readonly accessToken: string;
      /** Seconds until the access token expires. Absent when the answer had no `expires_in`. */
      readonly expiresIn?: number;
      /** A new refresh token, when the provider rotates them. The old one is then replaced. */
      readonly refreshToken?: string;
      /** The scopes granted, when the answer had `scope`. It can be fewer than at sign-in. */
      readonly grantedScopes?: readonly string[];
    }
  /** `invalid_grant`: the refresh token no longer works, so the user signs in again. */
  | { readonly kind: "grantRefused" }
  /** `invalid_client`: the provider no longer accepts the client or its secret. */
  | { readonly kind: "clientRefused" }
  | { readonly kind: "providerError"; readonly errorCode: string; readonly status: number }
  | { readonly kind: "unexpectedAnswer"; readonly status: number };

/** A positive, finite number field of a JSON object, or `undefined`. */
function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** A non-empty string field, or `undefined`. */
function textField(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Reads the provider's answer to a token refresh.
 * - `invalid_grant` is `grantRefused`; `invalid_client` is `clientRefused`;
 *   any other error is `providerError` with the code and the status;
 * - a success needs a `token_type` of `bearer` (any case) and an
 *   `access_token` that {@link isUsableToken} accepts; a `refresh_token` the
 *   answer carries must pass it too. Otherwise the answer is `unexpectedAnswer`
 *   and nothing is kept;
 * - `expires_in` and `scope` are optional (RFC 6749, section 5.1); a
 *   `expires_in` that isn't a positive number counts as absent.
 * The `error_description` is never read, because it can echo the request,
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
    return readRefusal(fields, status);
  }
  return readSuccess(fields, status);
}

/** What an error answer means: the two codes that need the user, or the provider's own code. */
function readRefusal(fields: Record<string, unknown>, status: number): RefreshAnswerMeaning {
  const errorCode = safeOAuthErrorCode(fields["error"]);
  if (errorCode === "invalid_grant") return { kind: "grantRefused" };
  if (errorCode === "invalid_client") return { kind: "clientRefused" };
  return { kind: "providerError", errorCode, status };
}

/** What a success answer means, or `unexpectedAnswer` when a token in it isn't fit to keep. */
function readSuccess(fields: Record<string, unknown>, status: number): RefreshAnswerMeaning {
  const tokenType = fields["token_type"];
  const accessToken = fields["access_token"];
  const rotated = fields["refresh_token"];
  const isBearer = typeof tokenType === "string" && tokenType.toLowerCase() === "bearer";
  // A refresh token the answer carries must pass too: an empty or null one counts as absent.
  const carriesRefreshToken = rotated !== undefined && rotated !== null && rotated !== "";
  if (
    !isBearer ||
    !isUsableToken(accessToken) ||
    (carriesRefreshToken && !isUsableToken(rotated))
  ) {
    return { kind: "unexpectedAnswer", status };
  }
  const expiresIn = positiveNumber(fields["expires_in"]);
  const scope = textField(fields["scope"]);
  return {
    kind: "refreshed",
    accessToken,
    ...(expiresIn === undefined ? {} : { expiresIn }),
    ...(carriesRefreshToken ? { refreshToken: rotated } : {}),
    ...(scope === undefined ? {} : { grantedScopes: scope.split(" ").filter(Boolean) }),
  };
}
