import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RUNTIME_EXPORT_MANIFEST } from "@halonicjs/format/runtime-export";
import type {
  DeployAccount,
  DeployedVersion,
  DeploymentRef,
  DeployResource,
  DeployTarget,
  DeployTargetContext,
  DeployTargetEntry,
  DeployTransferCounts,
  DestroyItem,
} from "@halonicjs/ports";
import { deployTargetVersion } from "@halonicjs/ports";
import { withAdminKey } from "./admin-key.ts";
import type { CloudflareApi, DeployedVersion as CloudflareVersion, ResourceKind } from "./api.ts";
import { createCloudflareClient } from "./client.ts";
import { resolveCredentials } from "./credentials.ts";
import { destroy } from "./destroy.ts";
import { lockHolderOf, portFailure, toDeployFailure } from "./port-failure.ts";
import { databaseNameFor } from "./provision.ts";
import { rollback } from "./rollback.ts";
import { status } from "./status.ts";
import { parseVersionNote } from "./version-note.ts";
import { exportFromWorker, importToWorker } from "./worker-transfer.ts";

/** The name `login` saves the Cloudflare API token under in the user's keychain. */
export const tokenName = "cloudflare-api-token";

/** What tests give in place of the real Cloudflare client. */
export interface CloudflareDeployTargetOptions {
  /** Builds the API for a token; defaults to the real client over the context's HTTP client. */
  readonly api?: (token: string) => CloudflareApi;
}

const resourceKinds: Readonly<Record<ResourceKind, DeployResource["kind"]>> = {
  worker: "service",
  database: "database",
  bucket: "bucket",
};

/**
 * The Cloudflare target as the {@link DeployTarget} port (requirement
 * `deploy.target-entry`): each method wraps this package's own function and
 * rejects with the port's failure. `plan`, `deploy` and `revokeSessions`
 * come in the next part and reject with `unexpected` until then.
 */
export function createCloudflareDeployTarget(
  context: DeployTargetContext,
  options: CloudflareDeployTargetOptions = {},
): DeployTarget {
  const fetchOver: typeof fetch = (input, init) =>
    context.http.fetch(input instanceof Request ? input.url : String(input), init);
  const apiFor =
    options.api ?? ((token: string) => createCloudflareClient({ token, fetch: fetchOver }));
  const label = context.who;

  const api = async (): Promise<CloudflareApi> => {
    const token = context.environmentToken ?? (await context.tokens.get(tokenName));
    if (token === null || token === "") {
      throw portFailure(
        "token-missing",
        "unauthenticated",
        "There's no Cloudflare API token on this computer.",
        "Run `halonic deploy login`, or set CLOUDFLARE_API_TOKEN in CI.",
      );
    }
    return apiFor(token);
  };

  const notYet = (method: string) => async (): Promise<never> => {
    throw portFailure("unexpected", "internal", `The Cloudflare target can't ${method} yet.`);
  };

  return {
    login: (token) =>
      guard(async () => {
        const cloudflare = apiFor(token);
        const accounts = await cloudflare.listAccounts();
        const [first] = accounts;
        if (first === undefined) {
          throw portFailure(
            "no-account",
            "not_found",
            "This token can't see any Cloudflare account.",
          );
        }
        await resolveCredentials(cloudflare, { token, accountId: first.id });
        await context.tokens.set(tokenName, token);
        return { accounts: accounts.map(({ id, name }) => ({ id, name })) };
      }),

    plan: notYet("plan a deploy"),
    deploy: notYet("deploy"),
    revokeSessions: notYet("sign out browsers"),

    status: (deployment) =>
      guard(async () => {
        const cloudflare = await api();
        const { accountId, service: worker } = deployment;
        const [account, found, numbers] = await Promise.all([
          accountOf(cloudflare, accountId),
          status(cloudflare, { accountId, worker, fetch: fetchOver }),
          versionNumbers(cloudflare, accountId, worker),
        ]);
        const main = found.versions.reduce<(typeof found.versions)[number] | undefined>(
          (a, b) => (a === undefined || b.percentage > a.percentage ? b : a),
          undefined,
        );
        const place = main ? numbers.ids.indexOf(main.id) : -1;
        const previousId = place > 0 ? numbers.ids[place - 1] : undefined;
        return {
          account,
          url: found.url,
          live: main ? version(numbers.ids, main.id, main.commit) : undefined,
          previous:
            previousId === undefined
              ? undefined
              : await describe(cloudflare, deployment, numbers.ids, previousId),
          health:
            found.health.state === "ok"
              ? { answering: true, lastRoutineTick: undefined }
              : { answering: false },
          runs: undefined,
          // Reading the lock without taking it comes with `plan`, which needs the same read.
          lockedBy: undefined,
          unfinished: undefined,
        };
      }),

    rollback: (deployment, request = {}) =>
      guard(async () => {
        const cloudflare = await api();
        const { accountId, service: worker } = deployment;
        const result = await rollback(cloudflare, {
          accountId,
          worker,
          label,
          fetch: fetchOver,
          ...(request.plan ? { plan: true } : {}),
          ...(request.signal ? { signal: request.signal } : {}),
        });
        const { ids } = await versionNumbers(cloudflare, accountId, worker);
        const [from, to] = await Promise.all([
          describe(cloudflare, deployment, ids, mainOf(result.from)),
          describe(cloudflare, deployment, ids, mainOf(result.to)),
        ]);
        return { mode: result.mode, from, to };
      }),

    export: (deployment, folder, request = {}) =>
      guard(async () => {
        const manifest = await withTransfer(await api(), deployment, request.signal, (job) =>
          exportFromWorker({ ...job, folder }),
        );
        return transferCounts(manifest.files);
      }),

    import: (deployment, folder, request = {}) =>
      guard(async () => {
        await withTransfer(await api(), deployment, request.signal, (job) =>
          importToWorker({ ...job, folder }),
        );
        const manifest = JSON.parse(await readFile(join(folder, RUNTIME_EXPORT_MANIFEST), "utf8"));
        return transferCounts(manifest.files);
      }),

    unlock: (deployment) =>
      guard(async () => {
        const cloudflare = await api();
        const { accountId, service: worker } = deployment;
        const database = databaseNameFor(worker);
        if ((await cloudflare.appliedMigrations(accountId, database)) === undefined) {
          return { freed: undefined };
        }
        // Taking the lock is the one read that says who holds it; a lock we win is ours to free.
        const id = crypto.randomUUID();
        const held = await cloudflare.takeDeployLock(accountId, database, {
          id,
          label,
          leaseMs: 60_000,
        });
        await cloudflare.releaseDeployLock(accountId, database, held.id);
        return { freed: held.id === id ? undefined : lockHolderOf(held) };
      }),

    destroy: (deployment, request) =>
      guard(async () => {
        const result = await destroy(await api(), {
          accountId: deployment.accountId,
          worker: deployment.service,
          label,
          confirm: (steps) => request.confirm(itemsOf(steps)),
          ...(request.plan ? { plan: true } : {}),
          ...(request.signal ? { signal: request.signal } : {}),
        });
        return { mode: result.mode, items: itemsOf(result.steps), left: [] };
      }),
  };

  async function withTransfer<T>(
    cloudflare: CloudflareApi,
    deployment: DeploymentRef,
    signal: AbortSignal | undefined,
    job: (options: {
      baseUrl: string;
      key: string;
      fetch: typeof fetch;
      signal?: AbortSignal;
    }) => Promise<T>,
  ): Promise<T> {
    const { accountId, service: worker } = deployment;
    const baseUrl = await cloudflare.workersDevUrl(accountId, worker);
    if (baseUrl === undefined) {
      throw portFailure(
        "not-deployed",
        "not_found",
        `${deployment.name} has no address to reach on Cloudflare.`,
      );
    }
    return withAdminKey(
      cloudflare,
      { accountId, worker, label, ...(signal ? { signal } : {}) },
      (key) => job({ baseUrl, key, fetch: fetchOver, ...(signal ? { signal } : {}) }),
    );
  }
}

/** The entry `halonic deploy` loads by name and checks against the port. */
export const deployTarget: DeployTargetEntry = {
  host: "cloudflare",
  version: deployTargetVersion,
  create: (context) => createCloudflareDeployTarget(context),
};

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw isPortFailure(error) ? error : toDeployFailure(error);
  }
}

function isPortFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "DeployFailure";
}

async function accountOf(api: CloudflareApi, id: string): Promise<DeployAccount> {
  const account = (await api.listAccounts()).find((a) => a.id === id);
  if (account === undefined) {
    throw portFailure(
      "no-account",
      "not_found",
      `This token can't see the Cloudflare account ${id}.`,
    );
  }
  return { id: account.id, name: account.name };
}

/**
 * Every version that ever served, oldest first, so a version's number is its
 * place here counting from 1. A deployment Cloudflare made for a secret
 * change runs the version before it, so it adds no number.
 */
async function versionNumbers(
  api: CloudflareApi,
  accountId: string,
  worker: string,
): Promise<{ readonly ids: readonly string[] }> {
  const ids: string[] = [];
  for (const deployment of [...(await api.deploymentHistory(accountId, worker))].reverse()) {
    if (deployment.some((v) => v.secretChange === true)) continue;
    for (const v of deployment) if (v.percentage > 0 && !ids.includes(v.id)) ids.push(v.id);
  }
  return { ids };
}

function version(ids: readonly string[], id: string, commit: string | undefined): DeployedVersion {
  // The Halonic version and the time it went live come with the snapshot's own record (next part).
  return {
    number: ids.indexOf(id) + 1,
    id,
    commit,
    halonicVersion: undefined,
    liveSince: undefined,
  };
}

async function describe(
  api: CloudflareApi,
  deployment: DeploymentRef,
  ids: readonly string[],
  id: string,
): Promise<DeployedVersion> {
  const info = await api.versionInfo(deployment.accountId, deployment.service, id);
  return version(ids, id, parseVersionNote(info?.message)?.commit);
}

function mainOf(versions: readonly CloudflareVersion[]): string {
  const [first, ...rest] = versions;
  if (first === undefined)
    throw portFailure("not-deployed", "not_found", "Nothing serves on Cloudflare.");
  return rest.reduce((a, b) => (b.percentage > a.percentage ? b : a), first).id;
}

function itemsOf(
  steps: readonly { kind: ResourceKind; name: string; action: string }[],
): DestroyItem[] {
  return steps
    .filter((step) => step.action === "delete")
    .map((step) => ({ resource: { kind: resourceKinds[step.kind], name: step.name } }));
}

function transferCounts(files: readonly { path: string; bytes: number }[]): DeployTransferCounts {
  const count = (prefix: string) => files.filter((f) => f.path.startsWith(prefix)).length;
  return {
    runs: count("runs/"),
    records: count("records/"),
    files: count("blobs/"),
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
  };
}
