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

/** One binding in the Worker's upload metadata, in Cloudflare's own shape (`{ type, name, ... }`). Never a secret value. */
export interface WorkerBinding {
  readonly type: string;
  readonly name: string;
  readonly [field: string]: unknown;
}

/** One Durable Object migration step, as the script upload takes it. */
export interface DurableObjectMigration {
  readonly tag: string;
  readonly new_sqlite_classes?: readonly string[];
  readonly [field: string]: unknown;
}

/** What goes up: the prebuilt script, its bindings and its secrets. */
export interface WorkerUpload {
  /** The Worker as one ES module script. */
  readonly script: string;
  readonly compatibilityDate: string;
  readonly bindings: readonly WorkerBinding[];
  /** Uploaded as `secret_text` bindings in the same request, so a version never runs without them. */
  readonly secrets: Readonly<Record<string, string>>;
  /** A short note shown with the version in Cloudflare's dashboard. */
  readonly message?: string;
}

/** One version in a deployment, with the share of traffic it gets. */
export interface DeployedVersion {
  readonly id: string;
  readonly percentage: number;
}

/** One version Cloudflare knows, with the note the deploy left on it. */
export interface VersionInfo {
  readonly id: string;
  /** The version's message, as the deploy wrote it (see `versionNote`). */
  readonly message?: string;
  /** When it was uploaded, in milliseconds since the epoch. */
  readonly createdAt?: number;
}

/** A resource found by listing an account, with when it was made. */
export interface ListedResource {
  readonly kind: ResourceKind;
  readonly name: string;
  readonly createdAt: number;
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
  /** The versions that serve traffic now; `undefined` when the Worker has no deployment yet. */
  currentDeployment(
    accountId: string,
    worker: string,
  ): Promise<readonly DeployedVersion[] | undefined>;
  /** Uploads a version that serves nothing yet and returns its id. Can't carry Durable Object migrations. */
  uploadVersion(accountId: string, worker: string, upload: WorkerUpload): Promise<string>;
  /**
   * Uploads the script and deploys it at once, with Durable Object migrations. Cloudflare
   * only applies a class change this way, and it can't be tried before it is live.
   */
  uploadWorkerLive(
    accountId: string,
    worker: string,
    upload: WorkerUpload,
    migrations: readonly DurableObjectMigration[],
  ): Promise<void>;
  /** Sets which versions serve traffic; the percentages add up to 100. */
  deployVersions(
    accountId: string,
    worker: string,
    versions: readonly DeployedVersion[],
  ): Promise<void>;
  /** Whether the Worker's workers.dev address is on now. */
  workersDevEnabled(accountId: string, worker: string): Promise<boolean>;
  /** Turns the workers.dev address on and preview addresses off, and returns the Worker's workers.dev URL. */
  openWorkersDev(accountId: string, worker: string): Promise<string>;
  /** Turns the workers.dev address off again, with preview addresses off. */
  closeWorkersDev(accountId: string, worker: string): Promise<void>;

  /** Every deployment of the Worker, newest first; empty when it has none or doesn't exist. */
  deploymentHistory(
    accountId: string,
    worker: string,
  ): Promise<readonly (readonly DeployedVersion[])[]>;
  /** One version's message and upload time; `undefined` when Cloudflare doesn't know it. Reads only. */
  versionInfo(
    accountId: string,
    worker: string,
    versionId: string,
  ): Promise<VersionInfo | undefined>;
  /** The Worker's workers.dev URL, or `undefined` when that address is off. Unlike `openWorkersDev`, changes nothing. */
  workersDevUrl(accountId: string, worker: string): Promise<string | undefined>;
  /** Every Worker, database or bucket in the account whose name starts with `prefix`. Reads only. */
  listResources(
    accountId: string,
    kind: ResourceKind,
    prefix: string,
  ): Promise<readonly ListedResource[]>;
  /**
   * Deletes a Worker, database or bucket by name; nothing happens when it is already gone.
   * A bucket that still holds objects is refused with `bucket-not-empty`.
   */
  deleteResource(accountId: string, ref: ResourceRef): Promise<void>;
}
