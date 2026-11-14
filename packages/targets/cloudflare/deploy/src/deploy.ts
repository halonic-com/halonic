import type { CloudflareApi, DurableObjectMigration, Migration, WorkerUpload } from "./api.ts";
import { DeployError } from "./errors.ts";
import { withDeployLock } from "./lock.ts";
import { migrate } from "./migrate.ts";
import { type ProvisionStep, provision } from "./provision.ts";
import { type UploadProgress, uploadAndSwitch } from "./upload.ts";

/** Where the deployed files come from: git, not the working folder. */
export interface DeploySource {
  /** The commit the deploy is taken from (its `HEAD`). The snapshot is read from git objects at this commit. */
  commit(): Promise<string>;
  /** Changed tracked files plus untracked files that aren't ignored. */
  changedFileCount(): Promise<number>;
}

/** What the caller builds from the snapshot at `commit`, once the missing secrets are known. */
export interface DeployPayload {
  /** The Worker script built from the snapshot at `commit`, so what is uploaded is what the result names. */
  readonly bundle: { readonly script: string; readonly hash: string };
  readonly bindings: WorkerUpload["bindings"];
  /** The Worker's own secrets. Sent in the upload; never logged. */
  readonly secrets: WorkerUpload["secrets"];
}

export interface DeployOptions {
  readonly accountId: string;
  readonly worker: string;
  /** `production` refuses uncommitted changes and failing tests; `development` only warns. */
  readonly environment: "production" | "development";
  readonly source: DeploySource;
  /** Checks the workspace (ADR 5.6 step 1). Throws to stop the deploy. */
  readonly validate: () => Promise<void>;
  /** Runs the workspace tests (step 2). Called for a `production` deploy, not for `plan`. Throws to stop the deploy. */
  readonly test: () => Promise<void>;
  /** Asks for missing secrets and builds the bundle and the upload from the snapshot at `commit` (steps 3–4). Not called by `plan`. */
  readonly prepare: (commit: string) => Promise<DeployPayload>;
  readonly migrations: readonly Migration[];
  readonly durableObjectMigrations?: readonly DurableObjectMigration[];
  readonly compatibilityDate: string;
  /** Lists what would happen and changes nothing: no lock, no questions, no writes. */
  readonly plan?: boolean;
  /** Allows a production deploy with uncommitted changes. */
  readonly allowDirty?: boolean;
  /** Allows a deploy to use resources Halonic didn't create. */
  readonly adopt?: boolean;
  /** What a second deploy is shown as the holder of the lock. */
  readonly label: string;
  /** Aborted on Ctrl C. The deploy stops at the next step and the lock is freed. */
  readonly signal?: AbortSignal;
  readonly message?: string;
  readonly onProgress?: (event: DeployProgress) => void;
  /** Tests inject these; they go to the upload step. */
  readonly upload?: Pick<
    Parameters<typeof uploadAndSwitch>[1],
    "fetch" | "sleep" | "randomToken" | "attempts"
  >;
}

/** What the deploy reports as it goes. The CLI formats these later. */
export type DeployProgress =
  | { readonly step: "validated" }
  | { readonly step: "tested" }
  | { readonly step: "snapshot"; readonly commit: string }
  /** A development deploy ignores `count` changed files. */
  | { readonly step: "uncommitted-files"; readonly count: number }
  | { readonly step: "provisioned"; readonly resources: readonly ProvisionStep[] }
  | { readonly step: "migrated"; readonly applied: readonly string[] }
  /** Said before the deploy that goes live without a trial, on a Worker that already has traffic. */
  | { readonly step: "live-migration-ahead"; readonly migrations: readonly string[] }
  | UploadProgress;

/** What `plan` found. Nothing was changed. */
export interface DeployPlan {
  readonly mode: "plan";
  readonly commit: string;
  readonly resources: readonly ProvisionStep[];
  /** Ids of the database migrations a deploy would apply. */
  readonly migrations: readonly string[];
}

export interface DeployDone {
  readonly mode: "deployed";
  readonly commit: string;
  readonly versionId: string;
}

/**
 * Runs ADR 5.6 steps 1–9 in order: validate, test (not for `plan`), snapshot from git, secrets, provision, migrate,
 * upload, smoke test, switch. The lock is taken before anything changes and freed at the end.
 *
 * @throws DeployError `uncommitted-changes` for a production deploy with uncommitted files
 * @throws DeployError `deploy-aborted` when the signal aborts between steps
 */
export async function deploy(
  api: CloudflareApi,
  options: DeployOptions,
): Promise<DeployPlan | DeployDone> {
  const report = options.onProgress ?? (() => {});
  const production = options.environment === "production";
  const checkAborted = () => {
    if (options.signal?.aborted)
      throw new DeployError("deploy-aborted", "The deploy was interrupted.");
  };
  const { accountId, worker } = options;
  const adopt = options.adopt === undefined ? {} : { adopt: options.adopt };

  await options.validate();
  report({ step: "validated" });
  if (production && !options.plan) {
    await options.test();
    report({ step: "tested" });
  }

  const commit = await options.source.commit();
  report({ step: "snapshot", commit });
  const changed = await options.source.changedFileCount();
  if (changed > 0) {
    if (production && !options.allowDirty && !options.plan) {
      throw new DeployError(
        "uncommitted-changes",
        `${changed} changed ${changed === 1 ? "file isn't" : "files aren't"} committed. A production deploy comes from a commit: commit them, or deploy with allow-dirty.`,
      );
    }
    report({ step: "uncommitted-files", count: changed });
  }

  if (options.plan) {
    const resources = await provision(api, { accountId, worker, ...adopt, plan: true });
    const migrations = await migrate(api, {
      accountId,
      worker,
      migrations: options.migrations,
      plan: true,
    });
    return { mode: "plan", commit, resources, migrations };
  }

  checkAborted();
  const payload = await options.prepare(commit);
  checkAborted();

  // Nothing is created before the secrets are in hand. Provisioning (database, bucket, Worker) runs
  // before the lock because the lock lives in the database; migrate, upload and switch run inside it.
  const resources = await provision(api, { accountId, worker, ...adopt });
  report({ step: "provisioned", resources });

  return withDeployLock(
    api,
    {
      accountId,
      worker,
      label: options.label,
      ...(options.signal ? { signal: options.signal } : {}),
    },
    async (lock) => {
      await lock.renew();
      checkAborted();
      const applied = await migrate(api, { accountId, worker, migrations: options.migrations });
      report({ step: "migrated", applied });

      await lock.renew();
      checkAborted();
      const doMigrations = options.durableObjectMigrations ?? [];
      if (doMigrations.length > 0) {
        const current = await api.currentDeployment(accountId, worker);
        if (current && current.length > 0)
          report({ step: "live-migration-ahead", migrations: doMigrations.map((m) => m.tag) });
      }
      const { versionId } = await uploadAndSwitch(api, {
        accountId,
        worker,
        bundle: payload.bundle,
        compatibilityDate: options.compatibilityDate,
        bindings: payload.bindings,
        secrets: payload.secrets,
        durableObjectMigrations: doMigrations,
        ...(options.message ? { message: options.message } : {}),
        onProgress: report,
        ...options.upload,
      });
      return { mode: "deployed" as const, commit, versionId };
    },
  );
}
