import { migrations } from "@halonicjs/adapter-cloudflare-storage";
import type {
  DeployAccount,
  DeployedVersion,
  DeployLockHolder,
  DeploymentRef,
  DeployPlan,
  DeployRequest,
  DeployResource,
  DeployTarget,
  DeployTargetContext,
  DeployTargetEntry,
  DeployTransferCounts,
  DestroyItem,
  HttpClient,
} from "@halonicjs/ports";
import { deployTargetVersion } from "@halonicjs/ports";
import { reachableAccounts } from "./accounts.ts";
import { withAdminKey } from "./admin-key.ts";
import type { CloudflareApi, ResourceKind } from "./api.ts";
import { createCloudflareClient } from "./client.ts";
import { resolveCredentials } from "./credentials.ts";
import { deployThroughPort, resourceKinds, type WorkerScript } from "./deploy-target-deploy.ts";
import {
  describe,
  liveWithReaches,
  mainOf,
  recordOf,
  version,
  versionNumbers,
} from "./deploy-target-versions.ts";
import { destroy } from "./destroy.ts";
import { migrate } from "./migrate.ts";
import { lockHolderOf, portFailure, toDeployFailure } from "./port-failure.ts";
import {
  databaseNameFor,
  type ProvisionAction,
  type ProvisionStep,
  provision,
} from "./provision.ts";
import { rollback } from "./rollback.ts";
import { status } from "./status.ts";
import type { UploadAndSwitchOptions } from "./upload.ts";
import { startsLike } from "./version-note.ts";
import { exportFromWorker, importToWorker } from "./worker-transfer.ts";

/** The name `login` saves the Cloudflare API token under in the user's keychain. */
export const tokenName = "cloudflare-api-token";

/** What tests give in place of the real Cloudflare client. */
export interface CloudflareDeployTargetOptions {
  /** Builds the API for a token; defaults to the real client over the context's HTTP client. */
  readonly api?: (token: string) => CloudflareApi;
  /**
   * The Worker `deploy` uploads. Tests and the live suite give it; until the
   * package ships its built Worker (HAL-16060), `deploy` rejects without it.
   */
  readonly worker?: () => Promise<WorkerScript>;
  /** Tests make the self-test quick with these. */
  readonly upload?: Pick<UploadAndSwitchOptions, "sleep" | "attempts">;
}

/**
 * The Cloudflare target as the {@link DeployTarget} port (requirement
 * `deploy.target-entry`): each method wraps this package's own function and
 * rejects with the port's failure. `revokeSessions` rejects with
 * `unexpected` until it has a way to end every session (HAL-16732).
 */
export function createCloudflareDeployTarget(
  context: DeployTargetContext,
  options: CloudflareDeployTargetOptions = {},
): DeployTarget {
  const fetchOver = fetchThrough(context.http);
  const apiFor =
    options.api ?? ((token: string) => createCloudflareClient({ token, fetch: fetchOver }));
  const label = context.who;

  const tokenOf = async (): Promise<string> => {
    // An empty token from the environment is no token, so it doesn't hide the saved one.
    const token = context.environmentToken || (await context.tokens.get(tokenName));
    if (token === null || token === "") {
      throw portFailure(
        "token-missing",
        "unauthenticated",
        "There's no Cloudflare token on this computer.",
        "Save one with halonic deploy login cloudflare, or set HALONIC_CLOUDFLARE_API_TOKEN.",
      );
    }
    return token;
  };
  const api = async (): Promise<CloudflareApi> => apiFor(await tokenOf());

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

    accounts: () =>
      guard(async () => {
        const token = await tokenOf();
        return reachableAccounts(apiFor(token), token);
      }),

    plan: (request) => guard(async () => planDeploy(await api(), request)),
    deploy: (request, onEvent) =>
      guard(async () => {
        const cloudflare = await api();
        const { worker } = options;
        if (worker === undefined) {
          throw portFailure(
            "unexpected",
            "internal",
            "This Halonic has no Cloudflare Worker to upload yet.",
          );
        }
        return deployThroughPort(cloudflare, request, onEvent, {
          label,
          fetch: fetchOver,
          worker,
          ...(options.upload ? { upload: options.upload } : {}),
        });
      }),
    revokeSessions: notYet("sign out browsers"),

    status: (deployment) =>
      guard(async () => {
        const cloudflare = await api();
        const { accountId, service: worker } = deployment;
        const [account, found, numbers, lockedBy] = await Promise.all([
          accountOf(cloudflare, accountId),
          status(cloudflare, { accountId, worker, fetch: fetchOver }),
          versionNumbers(cloudflare, accountId, worker),
          lockedByOf(cloudflare, deployment),
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
          live: await servingVersion(cloudflare, deployment, numbers.ids, main),
          previous:
            previousId === undefined
              ? undefined
              : await describe(cloudflare, deployment, numbers.ids, previousId),
          health:
            found.health.state === "ok"
              ? { answering: true, lastRoutineTick: undefined }
              : { answering: false },
          runs: undefined,
          lockedBy,
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
        const counts = await withTransfer(await api(), deployment, request.signal, (job) =>
          importToWorker({ ...job, folder }),
        );
        return {
          runs: counts.runs,
          records: counts.records,
          files: counts.blobs,
          bytes: counts.bytes,
        };
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

  /**
   * Measures a deploy against what's live (requirement `deploy.plan`): reads
   * only, takes no lock and asks nothing. A lock that can't be read fails the
   * plan, as it fails `status`: the deploy would hit the same database next.
   */
  async function planDeploy(
    cloudflare: CloudflareApi,
    request: DeployRequest,
  ): Promise<DeployPlan> {
    const { deployment, snapshot } = request;
    const { accountId, service: worker } = deployment;
    const [account, steps, databaseChanges, live, url, lockedBy, files] = await Promise.all([
      accountOf(cloudflare, accountId),
      provision(cloudflare, {
        accountId,
        worker,
        plan: true,
        ...(request.adopt ? { adopt: true } : {}),
      }),
      migrate(cloudflare, { accountId, worker, migrations, plan: true }),
      liveWithReaches(cloudflare, deployment),
      cloudflare.workersDevUrl(accountId, worker),
      lockedByOf(cloudflare, deployment),
      snapshot.files.list(),
    ]);
    return {
      account,
      url,
      creates: resourcesDoing(steps, "create"),
      adopts: resourcesDoing(steps, "adopt"),
      databaseChanges,
      // Halonic's own database changes only add tables and columns (deploy flow 3.7).
      deletesData: false,
      live: live?.version,
      // A live version without a record reaches nothing as far as the plan knows, so
      // everything counts as new and the plan is never "unchanged": the safe side.
      liveReaches: live?.reaches,
      lockedBy,
      unchanged:
        live?.version.commit !== undefined &&
        // The version note keeps a short commit.
        startsLike(snapshot.commit, live.version.commit) &&
        live.version.halonicVersion === snapshot.halonicVersion,
      files,
    };
  }

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

/**
 * `fetch` over the context's HTTP client, which takes a URL and an init. A
 * `Request` goes through whole: its method, headers, body and signal, not
 * only its URL.
 */
export function fetchThrough(http: HttpClient): typeof fetch {
  return (input, init) => {
    if (!(input instanceof Request)) return http.fetch(String(input), init);
    const request = init === undefined ? input : new Request(input, init);
    const { method, headers, body, signal, redirect } = request;
    // Node needs `duplex` to send a stream body; other runtimes ignore it.
    const forwarded = {
      method,
      headers,
      body,
      signal,
      redirect,
      ...(body ? { duplex: "half" } : {}),
    };
    return http.fetch(request.url, forwarded as RequestInit);
  };
}

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

/** The version `status` found serving, with its record; `undefined` when none serves. */
async function servingVersion(
  cloudflare: CloudflareApi,
  deployment: DeploymentRef,
  ids: readonly string[],
  main: { readonly id: string; readonly commit?: string | undefined } | undefined,
): Promise<DeployedVersion | undefined> {
  if (main === undefined) return undefined;
  return version(ids, main.id, main.commit, await recordOf(cloudflare, deployment, main.id));
}

/** The resources provisioning would `create` or `adopt`, as the port names them. */
function resourcesDoing(
  steps: readonly ProvisionStep[],
  action: ProvisionAction,
): DeployResource[] {
  return steps
    .filter((step) => step.action === action)
    .map((step) => ({ kind: resourceKinds[step.kind], name: step.name }));
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

/** Who holds the deployment's lock, read without taking it (requirement `deploy.lock-read`). */
async function lockedByOf(
  api: CloudflareApi,
  deployment: DeploymentRef,
): Promise<DeployLockHolder | undefined> {
  const held = await api.readDeployLock(deployment.accountId, databaseNameFor(deployment.service));
  return held === undefined ? undefined : lockHolderOf(held);
}

function itemsOf(
  steps: readonly { kind: ResourceKind; name: string; action: string }[],
): DestroyItem[] {
  return steps
    .filter((step) => step.action === "delete")
    .map((step) => ({ resource: { kind: resourceKinds[step.kind], name: step.name } }));
}

/**
 * An export's counts from its manifest: one per file, so `records` counts collections, as the
 * Worker counts what `import` read. Both sides use the same unit.
 */
function transferCounts(files: readonly { path: string; bytes: number }[]): DeployTransferCounts {
  const count = (prefix: string) => files.filter((f) => f.path.startsWith(prefix)).length;
  return {
    runs: count("runs/"),
    records: count("records/"),
    files: count("blobs/"),
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
  };
}
