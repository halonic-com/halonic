import type { TokenKind } from "./provider-behavior.ts";

/** An authorization code the provider handed out. */
export interface IssuedCode {
  readonly code: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly challenge: string;
  readonly scope: string;
  used: boolean;
  /** The grant the code made, so a second use of the code can end it (RFC 6749, section 4.1.2). */
  grant?: Grant;
}

/** One sign-in as the provider sees it: a family of refresh tokens and the access tokens made from them. */
export interface Grant {
  readonly clientId: string;
  readonly scope: string;
  revoked: boolean;
  currentRefreshToken: string;
  /** Every refresh token this grant ever had, including the retired ones. */
  readonly refreshTokens: string[];
  /** Access token to the time it stops working, in milliseconds. `Infinity` for one without an expiry. */
  readonly accessTokens: Map<string, number>;
}

/** What the provider remembers: its codes, grants and how many tokens it made. */
export class GrantLedger {
  readonly codes = new Map<string, IssuedCode>();
  readonly grants: Grant[] = [];
  private readonly made: Record<TokenKind, number> = { code: 0, access: 0, refresh: 0 };

  /** The next number for a kind of token, starting at 1. */
  next(kind: TokenKind): number {
    this.made[kind] += 1;
    return this.made[kind];
  }

  /** The grant that holds this refresh token, now or in the past. */
  grantOfRefreshToken(token: string): Grant | undefined {
    return this.grants.find((grant) => grant.refreshTokens.includes(token));
  }

  /** The grant that issued this access token, if it still has it. */
  grantOfAccessToken(token: string): Grant | undefined {
    return this.grants.find((grant) => grant.accessTokens.has(token));
  }

  /** Whether the provider would accept this access token at `nowMs`. */
  accessTokenWorks(token: string, nowMs: number): boolean {
    const grant = this.grantOfAccessToken(token);
    return grant !== undefined && !grant.revoked && (grant.accessTokens.get(token) ?? 0) > nowMs;
  }
}
