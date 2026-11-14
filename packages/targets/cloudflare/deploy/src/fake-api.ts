import type {
  CloudflareAccount,
  CloudflareApi,
  DeployedVersion,
  DeployLease,
  FoundResource,
  ListedResource,
  Migration,
  ResourceRef,
  TokenStatus,
  VersionInfo,
} from "./api.ts";
import { DeployError } from "./errors.ts";

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
  /** The versions serving traffic; none means the Worker was never deployed. */
  deployment?: readonly DeployedVersion[];
  /** Earlier deployments, newest first, after `deployment`. */
  earlier?: readonly (readonly DeployedVersion[])[];
  /** Version messages by version id. */
  versionMessages?: Record<string, string>;
  /** The workers.dev address is off. */
  workersDevOff?: boolean;
  /** What listing the account returns. */
  listed?: readonly ListedResource[];
  /** Deleting this bucket fails because it holds files. */
  fullBucket?: string;
  /** The workers.dev address `openWorkersDev` returns. */
  workersDev?: string;
  /** Whether workers.dev is on before the deploy. Defaults to on. */
  workersDevOn?: boolean;
  /** Closing workers.dev throws. */
  closeFails?: boolean;
  /** A migration the Worker's own runner applies just before our batch lands, so our batch fails. */
  racedBy?: string;
}

/** A {@link CloudflareApi} in memory that records each call, for tests of everything above the client. */
export function fakeCloudflareApi(
  state: FakeCloudflareState,
): CloudflareApi & { calls: string[]; messages: (string | undefined)[] } {
  const calls: string[] = [];
  const messages: (string | undefined)[] = [];
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
  const history: (readonly DeployedVersion[])[] = [
    ...(state.deployment ? [state.deployment] : []),
    ...(state.earlier ?? []),
  ];
  const deploy = (next: readonly DeployedVersion[]) => history.unshift(next);
  let versions = 0;
  let workersDevOn = state.workersDevOn ?? true;
  return {
    calls,
    messages,
    async currentDeployment() {
      calls.push("currentDeployment");
      return history[0];
    },
    async deploymentHistory() {
      calls.push("deploymentHistory");
      return [...history];
    },
    async versionInfo(_accountId, _worker, versionId): Promise<VersionInfo | undefined> {
      calls.push(`versionInfo ${versionId}`);
      const message = state.versionMessages?.[versionId];
      return message === undefined ? undefined : { id: versionId, message, createdAt: 1_000 };
    },
    async workersDevUrl(_accountId, worker) {
      calls.push(`workersDevUrl ${worker}`);
      return state.workersDevOff
        ? undefined
        : (state.workersDev ?? `https://${worker}.test.workers.dev`);
    },
    async listResources(_accountId, kind, prefix) {
      calls.push(`listResources ${kind} ${prefix}`);
      return (state.listed ?? []).filter((r) => r.kind === kind && r.name.startsWith(prefix));
    },
    async deleteResource(_accountId, ref) {
      if (state.failOnWrite) throw new Error(`unexpected write: deleteResource ${key(ref)}`);
      if (ref.kind === "bucket" && state.fullBucket === ref.name) {
        throw new DeployError("bucket-not-empty", `Bucket ${ref.name} still holds files.`);
      }
      calls.push(`deleteResource ${key(ref)}`);
      delete resources[key(ref)];
    },
    async uploadVersion(_accountId, worker, upload) {
      lockWrite(`uploadVersion ${worker}`);
      versions += 1;
      messages.push(upload.message);
      calls.push(`secrets ${Object.keys(upload.secrets).sort().join(",")}`);
      return `v${versions}`;
    },
    async uploadWorkerLive(_accountId, worker, upload, migrations) {
      lockWrite(`uploadWorkerLive ${worker} ${migrations.map((m) => m.tag).join(",")}`);
      calls.push(`secrets ${Object.keys(upload.secrets).sort().join(",")}`);
      messages.push(upload.message);
      versions += 1;
      deploy([{ id: `v${versions}`, percentage: 100 }]);
    },
    async deployVersions(_accountId, _worker, next) {
      lockWrite(`deployVersions ${next.map((v) => `${v.id}:${v.percentage}`).join(",")}`);
      deploy(next);
    },
    async workersDevEnabled() {
      calls.push("workersDevEnabled");
      return workersDevOn;
    },
    async closeWorkersDev(_accountId, worker) {
      lockWrite(`closeWorkersDev ${worker}`);
      if (state.closeFails) throw new Error("Cloudflare is down");
      workersDevOn = false;
    },
    async openWorkersDev(_accountId, worker) {
      lockWrite(`openWorkersDev ${worker}`);
      workersDevOn = true;
      return state.workersDev ?? `https://${worker}.test.workers.dev`;
    },
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
