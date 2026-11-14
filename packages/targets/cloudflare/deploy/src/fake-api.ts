import type {
  CloudflareAccount,
  CloudflareApi,
  DeployLease,
  FoundResource,
  Migration,
  ResourceRef,
  TokenStatus,
} from "./api.ts";

/** What a fake Cloudflare knows. */
export interface FakeCloudflareState {
  accounts: readonly CloudflareAccount[];
  /** Answers per endpoint; a missing entry means "active". */
  userToken?: TokenStatus | Error;
  accountToken?: TokenStatus | Error;
  /** Existing resources by `kind name`. */
  resources?: Record<string, FoundResource>;
  /** Makes every call that changes something throw, to prove a mode writes nothing. */
  failOnWrite?: boolean;
  /** Migration ids already applied. */
  applied?: readonly string[];
  /** The database doesn't exist yet. */
  noDatabase?: boolean;
  /** A deploy lease already in the lock table. */
  lock?: DeployLease;
  /** Every renewal throws, as a dropped connection would. Can be switched on mid-test. */
  renewFails?: boolean;
  /** The database's clock in milliseconds, which decides lease times. Defaults to `Date.now`. */
  now?: () => number;
  /** A migration the Worker's own runner applies just before our batch lands, so our batch fails. */
  racedBy?: string;
}

/** A {@link CloudflareApi} in memory that records each call, for tests of everything above the client. */
export function fakeCloudflareApi(state: FakeCloudflareState): CloudflareApi & { calls: string[] } {
  const calls: string[] = [];
  const answer = (value: TokenStatus | Error | undefined): TokenStatus => {
    if (value instanceof Error) throw value;
    return value ?? { active: true };
  };
  const resources = { ...state.resources };
  const key = (ref: ResourceRef) => `${ref.kind} ${ref.name}`;
  const write = (call: string, ref: ResourceRef, marked: boolean) => {
    if (state.failOnWrite) throw new Error(`unexpected write: ${call} ${key(ref)}`);
    calls.push(`${call} ${key(ref)}`);
    resources[key(ref)] = { marked };
  };
  const applied = [...(state.applied ?? [])];
  let lock = state.lock;
  const lockWrite = (call: string) => {
    if (state.failOnWrite) throw new Error(`unexpected write: ${call}`);
    calls.push(call);
  };
  return {
    calls,
    async listAccounts() {
      calls.push("listAccounts");
      return state.accounts;
    },
    async verifyUserToken() {
      calls.push("verifyUserToken");
      return answer(state.userToken);
    },
    async verifyAccountToken(accountId) {
      calls.push(`verifyAccountToken ${accountId}`);
      return answer(state.accountToken);
    },
    async findResource(_accountId, ref) {
      calls.push(`findResource ${key(ref)}`);
      return resources[key(ref)];
    },
    async createResource(_accountId, ref) {
      write("createResource", ref, true);
    },
    async adoptResource(_accountId, ref) {
      write("adoptResource", ref, true);
    },
    async appliedMigrations() {
      calls.push("appliedMigrations");
      return state.noDatabase ? undefined : [...applied];
    },
    async takeDeployLock(_accountId, _db, request) {
      lockWrite(`takeDeployLock ${request.id}`);
      const now = (state.now ?? Date.now)();
      // The same rule as the SQL: win when there is no lease or the old one has expired.
      if (!lock || lock.expiresAt <= now) {
        lock = {
          id: request.id,
          label: request.label,
          startedAt: now,
          expiresAt: now + request.leaseMs,
        };
      }
      return lock;
    },
    async renewDeployLock(_accountId, _db, leaseId, leaseMs) {
      lockWrite(`renewDeployLock ${leaseId}`);
      if (state.renewFails) throw new Error("renewal failed");
      if (lock?.id !== leaseId) return undefined;
      lock = { ...lock, expiresAt: (state.now ?? Date.now)() + leaseMs };
      return lock;
    },
    async releaseDeployLock(_accountId, _db, leaseId) {
      lockWrite(`releaseDeployLock ${leaseId}`);
      if (lock?.id === leaseId) lock = undefined;
    },
    async applyMigration(_accountId, _databaseName, migration: Migration) {
      if (state.failOnWrite) throw new Error(`unexpected write: applyMigration ${migration.id}`);
      calls.push(`applyMigration ${migration.id}`);
      if (state.racedBy === migration.id) {
        applied.push(migration.id);
        throw new Error(`UNIQUE constraint failed: schema_migrations.id (${migration.id})`);
      }
      applied.push(migration.id);
    },
  };
}
