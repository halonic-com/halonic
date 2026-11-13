import { safeOAuthErrorCode } from "./oauth-error-code.ts";

/** The provider's answer to the code exchange, as the host received it. */
export interface TokenAnswer {
  /** The HTTP status. */
  readonly status: number;
  /** The body parsed as JSON, or `undefined` when it wasn't JSON (an HTML error page, say). */
  readonly json: unknown;
}

/**
 * What the token answer means. Only `tokens` holds secrets (the refresh token
 * and the ID token); it stays in the host package. Every other kind is safe to
 * show and to log: it carries at most the provider's error code and the status.
 */
export type TokenAnswerMeaning =
  | {
      readonly kind: "tokens";
      /** Absent when the provider gave none: a refresh token is optional (RFC 6749, section 5.1). */
      readonly refreshToken?: string;
      /** Absent when the answer had no `id_token`: OpenID Connect providers only. */
      readonly idToken?: string;
      /** The scopes granted, from the answer's `scope` field. Absent when it had none. */
      readonly grantedScopes?: readonly string[];
    }
  | { readonly kind: "wrongClientSecret" }
  | { readonly kind: "codeRefused" }
  | { readonly kind: "providerError"; readonly errorCode: string; readonly status: number }
  | { readonly kind: "unexpectedAnswer"; readonly status: number };

/**
 * Classifies the provider's answer to the code exchange.
 * - `invalid_client` means the client secret is wrong;
 * - `invalid_grant` means the code expired or was used, so the user signs in again;
 * - an answer that isn't a JSON object is `unexpectedAnswer`.
 * The answer's `error_description` is never read, because it can echo the request.
 * The access token is left out on purpose: the host reads it where the checks use it.
 * A provider that needs more of its success answer (Google needs an ID token
 * and the scopes) checks that itself.
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
    const errorCode = safeOAuthErrorCode(fields["error"]);
    if (errorCode === "invalid_client") {
      return { kind: "wrongClientSecret" };
    }
    if (errorCode === "invalid_grant") {
      return { kind: "codeRefused" };
    }
    return { kind: "providerError", errorCode, status };
  }

  const refreshToken = textField(fields, "refresh_token");
  const idToken = textField(fields, "id_token");
  const scope = textField(fields, "scope");
  return {
    kind: "tokens",
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(idToken === undefined ? {} : { idToken }),
    ...(scope === undefined ? {} : { grantedScopes: scope.split(" ").filter(Boolean) }),
  };
}

/** A non-empty string field of the answer, or `undefined` when it is missing, empty or not a string. */
function textField(json: Record<string, unknown>, name: string): string | undefined {
  const value = json[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}
