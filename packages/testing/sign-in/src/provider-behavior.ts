/** How a token is made: a code, an access token or a refresh token, numbered in the order the provider made them. */
export type TokenKind = "code" | "access" | "refresh";

/**
 * What the fake provider does, for a test to change while it runs. The
 * defaults are a well-behaved provider; each field is one way to make it
 * hostile.
 */
export interface ProviderBehavior {
  /** Every refresh gives a new refresh token and retires the old one. */
  rotateRefreshTokens: boolean;
  /** With rotation, presenting a retired refresh token ends the whole grant, as a provider with reuse detection does. */
  detectReuse: boolean;
  /** Seconds an access token lives, or `null` for an answer without `expires_in`. */
  accessTokenLifetimeSeconds: number | null;
  /** Set on every good token answer. A field set to `undefined` is left out, so this also takes fields away. */
  answerFields: Record<string, unknown>;
  /** Answers every token request with this text instead, whatever was asked. */
  rawTokenAnswer?: { status: number; body: string; contentType?: string };
  /** The token endpoint answers 307 to this address. */
  redirectTokenEndpointTo?: string;
  /** Adds a field of this many characters to a good token answer. */
  padTokenAnswerBytes: number;
  /** Added as `iss` to every callback. */
  issuer?: string;
  /** What the revoke endpoint answers. */
  revokeStatus: number;
  /** Makes the value of a token. Return a value with characters that need escaping to test the filter. */
  makeToken: (kind: TokenKind, number: number) => string;
}

/** A provider that follows the rules and makes plain tokens of 16 characters or more. */
export function wellBehaved(): ProviderBehavior {
  return {
    rotateRefreshTokens: false,
    detectReuse: true,
    accessTokenLifetimeSeconds: 3600,
    answerFields: {},
    padTokenAnswerBytes: 0,
    revokeStatus: 200,
    makeToken: (kind, number) => `fake-${kind}-token-${String(number).padStart(4, "0")}`,
  };
}
