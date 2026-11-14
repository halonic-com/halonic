/** The kinds of Cloudflare API token Halonic accepts. */
export type TokenKind = "user" | "account" | "legacy";

/** An account the token can act on. */
export interface CloudflareAccount {
  readonly id: string;
  readonly name: string;
}

/** What Cloudflare says about a token. */
export interface TokenStatus {
  readonly active: boolean;
}

/**
 * The Cloudflare calls the deploy makes. Everything above the client depends on this port, so
 * it tests with a fake and no network. Later steps add their calls here.
 */
export interface CloudflareApi {
  /** `GET /accounts`: the accounts the token can see. */
  listAccounts(): Promise<readonly CloudflareAccount[]>;
  /** `GET /user/tokens/verify`: for user and legacy tokens. */
  verifyUserToken(): Promise<TokenStatus>;
  /** `GET /accounts/{id}/tokens/verify`: for account tokens. */
  verifyAccountToken(accountId: string): Promise<TokenStatus>;
}
