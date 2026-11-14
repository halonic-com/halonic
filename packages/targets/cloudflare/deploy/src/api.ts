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

/** One schema step: statements that run together, once per database. Same shape as the Worker's own. */
export interface Migration {
  readonly id: string;
  readonly statements: readonly string[];
}

/** What a deploy asks for when it takes the lock. The database fills in the times. */
export interface DeployLeaseRequest {
  /** Unique to one deploy; what the conditional writes compare. */
  readonly id: string;
  /** What a second deploy is shown, such as `mateo on laptop`. */
  readonly label: string;
  /** How long the lease lasts without a renewal. */
  readonly leaseMs: number;
}

/** One deploy's claim on the lock, as stored. Times are the database's clock, in milliseconds since the epoch. */
export interface DeployLease {
  readonly id: string;
  readonly label: string;
  readonly startedAt: number;
  readonly expiresAt: number;
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
  /** The ids of the migrations the database has applied (empty when it has none yet); `undefined` when the database doesn't exist. */
  appliedMigrations(
    accountId: string,
    databaseName: string,
  ): Promise<readonly string[] | undefined>;
  /** Runs the migration's statements and records its id in one D1 batch, so both happen or neither. */
  applyMigration(accountId: string, databaseName: string, migration: Migration): Promise<void>;
  /**
   * Takes the deploy lock when none exists or the old lease has expired, in one conditional
   * write. The database's clock decides "now", not the caller's, so machines with different
   * clocks can't both win. Returns the lease in force afterwards: ours when it won,
   * the holder's when it didn't.
   */
  takeDeployLock(
    accountId: string,
    databaseName: string,
    request: DeployLeaseRequest,
  ): Promise<DeployLease>;
  /**
   * Moves the lease's expiry to the database's "now" plus `leaseMs`, only while `leaseId` still
   * holds it. Returns the lease as stored, or `undefined` when someone else holds the lock.
   */
  renewDeployLock(
    accountId: string,
    databaseName: string,
    leaseId: string,
    leaseMs: number,
  ): Promise<DeployLease | undefined>;
  /** Frees the lock, only while `leaseId` still holds it. */
  releaseDeployLock(accountId: string, databaseName: string, leaseId: string): Promise<void>;
}
