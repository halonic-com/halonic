import {
  classifyTokenAnswer as classifyOAuthTokenAnswer,
  type TokenAnswer,
} from "@halonicjs/oauth-sign-in";

export type { TokenAnswer };

/** Google's token endpoint. A constant, so the ID token is only ever read from Google's answer. */
export const googleTokenEndpoint = "https://oauth2.googleapis.com/token";

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

/**
 * Classifies Google's answer to the code exchange, as
 * `classifyTokenAnswer` in `@halonicjs/oauth-sign-in` does, and holds it to
 * what Google always sends: a success without an ID token or scopes is
 * `unexpectedAnswer`, and one without a refresh token is `noRefreshToken`.
 *
 * @param answer - the status and the parsed body
 * @returns what the answer means
 */
export function classifyTokenAnswer(answer: TokenAnswer): TokenAnswerMeaning {
  const meaning = classifyOAuthTokenAnswer(answer);
  if (meaning.kind === "providerError") {
    return { ...meaning, kind: "googleError" };
  }
  if (meaning.kind !== "tokens") {
    return meaning;
  }
  const { refreshToken, idToken, grantedScopes } = meaning;
  if (idToken === undefined || grantedScopes === undefined) {
    return { kind: "unexpectedAnswer", status: answer.status };
  }
  if (refreshToken === undefined) {
    return { kind: "noRefreshToken" };
  }
  return { kind: "tokens", refreshToken, idToken, grantedScopes };
}
