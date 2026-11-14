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

/** What Halonic deploys into an account. */
export type ResourceKind = "worker" | "database" | "bucket";

/** One named resource. A bucket's marker lives in the D1 database named by `markedIn`. */
export interface ResourceRef {
  readonly kind: ResourceKind;
  readonly name: string;
  readonly markedIn?: string;
}

/** A resource that exists. `marked` is true when Halonic made it (or adopted it). */
export interface FoundResource {
  readonly marked: boolean;
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
  /** Looks a resource up by name; `undefined` when it doesn't exist. Changes nothing. */
  findResource(accountId: string, ref: ResourceRef): Promise<FoundResource | undefined>;
  /** Creates a database or bucket and marks it as ours. Not for workers: the upload makes those. */
  createResource(accountId: string, ref: ResourceRef): Promise<void>;
  /** Marks an existing database or bucket as ours, so a deploy may use it. */
  adoptResource(accountId: string, ref: ResourceRef): Promise<void>;
}
