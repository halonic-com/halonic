import { migrations } from "@halonicjs/adapter-cloudflare-storage";
import type {
  DefinitionSource,
  DeployEvent,
  DeployedVersion,
  DeployRequest,
  DeployResource,
  DeployResult,
  DeploySelfTestFailed,
  DeployStep,
} from "@halonicjs/ports";
import { secretKey } from "@halonicjs/ports";
import type { CloudflareApi, DurableObjectMigration, ResourceKind, WorkerBinding } from "./api.ts";
import { type DeployProgress, deploy } from "./deploy.ts";
import { writeDeployRecord } from "./deploy-record.ts";
import { liveVersion } from "./deploy-target-versions.ts";
import { DeployError, SmokeTestFailedError } from "./errors.ts";
import { toDeployFailure } from "./port-failure.ts";
import { databaseNameFor } from "./provision.ts";
import type { UploadAndSwitchOptions } from "./upload.ts";

/**
 * The Worker `deploy` uploads: the runtime, the same script for every
 * workspace on one Halonic version (HAL-16060). The workspace's files go to
 * the definitions bucket, not into the script.
 */
export interface WorkerScript {
  readonly script: string;
  /** The script's SHA-256 in hex; the upload refuses a script that doesn't match it. */
  readonly hash: string;
  readonly compatibilityDate: string;
  /** The Worker's Durable Object bindings, by binding name and class. */
  readonly durableObjects: readonly { readonly name: string; readonly class_name: string }[];
  /** What creates those classes; a Worker's first deploy applies them. */
  readonly durableObjectMigrations: readonly DurableObjectMigration[];
}

export interface PortDeployOptions {
  /** Who the lock names: the context's `who`. */
  readonly label: string;
  readonly fetch: typeof fetch;
  readonly worker: () => Promise<WorkerScript>;
  readonly upload?: Pick<UploadAndSwitchOptions, "sleep" | "attempts">;
}

/** Where the runtime reads a secret: `HALONIC_SECRET_<NAME>`, as `@halonicjs/adapter-env-secrets` names it. */
const secretPrefix = "HALONIC_SECRET_";

/** A Cloudflare resource as the port names it: a Worker is a `service`. */
export const resourceKinds: Readonly<Record<ResourceKind, DeployResource["kind"]>> = {
  worker: "service",
  database: "database",
  bucket: "bucket",
};

/**
 * The port's `deploy` over this package's `deploy` (requirement
 * `deploy.target-deploy`). The app service has validated and tested the
 * snapshot already, so nothing runs twice here. Each step is reported as the
 * port's events; a failed self-test is a result, not a failure; a stop says
 * what still serves and the step it stopped after.
 */
export async function deployThroughPort(
  cloudflare: CloudflareApi,
  request: DeployRequest,
  onEvent: (event: DeployEvent) => void,
  options: PortDeployOptions,
): Promise<DeployResult> {
  const { deployment, snapshot } = request;
  const { accountId, service: worker } = deployment;
  const worked = await options.worker();
  const [previous, files, address, firstDeploy] = await Promise.all([
    liveVersion(cloudflare, deployment),
    filesOf(snapshot.files),
    cloudflare.workersDevAddress(accountId, worker),
    cloudflare.currentDeployment(accountId, worker).then((current) => current === undefined),
  ]);
  const secrets = Object.fromEntries(
    [...request.secrets].map(([name, value]) => [secretPrefix + secretKey(name), value]),
  );
  const number = (previous?.number ?? 0) + 1;
  const made = (id: string): DeployedVersion => ({
    number,
    id,
    commit: snapshot.commit,
    halonicVersion: snapshot.halonicVersion,
    liveSince: undefined,
  });
  const events = eventsFor(onEvent, {
    step: "upload",
    version: number,
    files: Object.keys(files).length,
    secrets: request.secrets.size,
  });

  try {
    const done = await deploy(cloudflare, {
      accountId,
      worker,
      environment: deployment.environment,
      source: {
        commit: async () => snapshot.commit,
        changedFileCount: async () => 0,
        files: async () => files,
      },
      validate: async () => {},
      test: async () => {},
      prepare: async () => ({
        bundle: { script: worked.script, hash: worked.hash },
        bindings: bindingsFor(deployment.name, worker, worked, address),
        secrets,
      }),
      resourceBindings: async () => {
        const name = databaseNameFor(worker);
        const id = await cloudflare.databaseId(accountId, name);
        // Provisioning has made it by now; binding `id: undefined` would fail later and less clearly.
        if (id === undefined) {
          throw new DeployError(
            "cloudflare-request-failed",
            `Cloudflare doesn't list the database ${name}, which this deploy just set up.`,
          );
        }
        return [{ type: "d1", name: "DB", id }];
      },
      migrations,
      // A Worker that served already has its classes.
      durableObjectMigrations: firstDeploy ? worked.durableObjectMigrations : [],
      compatibilityDate: worked.compatibilityDate,
      label: options.label,
      onProgress: events.report,
      ...(request.adopt ? { adopt: true } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      upload: { fetch: options.fetch, ...options.upload },
    });
    if (done.mode !== "deployed") throw new Error("deploy planned instead of deploying");
    await writeDeployRecord(cloudflare, accountId, worker, done.versionId, {
      commit: snapshot.commit,
      halonicVersion: snapshot.halonicVersion,
      reaches: request.reaches,
    }).catch(() => {
      // The version serves already. Without its record the next plan counts everything
      // as new and asks again, the safe side, so a failed write doesn't fail the deploy.
    });
    return {
      outcome: "deployed",
      url: (await cloudflare.workersDevUrl(accountId, worker)) ?? address,
      version: made(done.versionId),
      previous,
      warnings: done.warnings ?? [],
    };
  } catch (error) {
    return failedSelfTest(error, made(events.uploadedId() ?? ""), previous, events);
  }
}

/**
 * A failed self-test as the port's result. A stop throws the port's `stopped`
 * with what still serves and the step it stopped after, and so does a lock
 * lost before traffic moved, so the caller can't mistake it for a deploy that
 * never started; anything else is thrown as it is.
 */
function failedSelfTest(
  error: unknown,
  version: DeployedVersion,
  previous: DeployedVersion | undefined,
  events: { last(): DeployStep | undefined; wentLive(): boolean },
): DeploySelfTestFailed {
  if (error instanceof SmokeTestFailedError) {
    return {
      outcome: "self-test-failed",
      version,
      failedChecks: error.failedChecks,
      stillLive: error.liveBefore ? previous : undefined,
      restoreFailed: error.restoreFailed,
    };
  }
  const last = events.last();
  // A deploy stops only before its upload, and a lock is lost only before traffic moves, so
  // what served before still serves. A lost lock was held, so the snapshot or database changes
  // may be written already: saying what serves keeps it apart from a deploy that never started.
  const stoppedEarly =
    error instanceof DeployError &&
    (error.code === "deploy-aborted" || (error.code === "deploy-lock-lost" && !events.wentLive()));
  if (stoppedEarly) {
    throw Object.assign(toDeployFailure(error), {
      live: previous ?? "none",
      ...(last === undefined ? {} : { stoppedAfter: last }),
    });
  }
  throw error;
}

/** Every file of the snapshot by path, as the definitions bucket takes them. */
async function filesOf(source: DefinitionSource): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const path of await source.list()) {
    const text = await source.read(path);
    if (text !== null) files[path] = text;
  }
  return files;
}

/**
 * The runtime's bindings but `DB`, whose id exists only once provisioning ran;
 * the deploy adds `DEFINITIONS` and the snapshot's version itself.
 */
function bindingsFor(
  name: string,
  worker: string,
  worked: WorkerScript,
  address: string,
): WorkerBinding[] {
  return [
    ...worked.durableObjects.map((binding) => ({ type: "durable_object_namespace", ...binding })),
    { type: "r2_bucket", name: "BLOBS", bucket_name: `${worker}-blobs` },
    { type: "plain_text", name: "HALONIC_ALLOWED_HOSTS", text: new URL(address).host },
    { type: "plain_text", name: "HALONIC_DEPLOYMENT_ID", text: name },
  ];
}

type ProgressOf<S extends DeployProgress["step"]> = Extract<DeployProgress, { step: S }>;

/**
 * Reports the deploy's progress as the port's events, in order, and keeps the
 * last step that finished and the id of the version it uploaded.
 */
function eventsFor(
  onEvent: (event: DeployEvent) => void,
  upload: Extract<DeployStep, { step: "upload" }>,
) {
  const { version } = upload;
  let last: DeployStep | undefined;
  let uploadedId: string | undefined;
  let wentLive = false;
  let firstDatabase = false;
  let selfTestSince = 0;
  const show = (step: DeployStep, phase: "started" | "done") => {
    onEvent({ ...step, phase });
    if (phase === "done") last = step;
  };
  const both = (step: DeployStep) => {
    show(step, "started");
    show(step, "done");
  };
  const on: { [S in DeployProgress["step"]]?: (progress: ProgressOf<S>) => void } = {
    provisioned: ({ resources }) => {
      for (const { kind, name, action } of resources) {
        if (action !== "create") continue;
        if (kind === "database") firstDatabase = true;
        both({ step: "create", resource: { kind: resourceKinds[kind], name } });
      }
    },
    migrated: ({ applied }) => {
      if (applied.length > 0)
        both({ step: "database", changes: applied.length, first: firstDatabase });
    },
    "live-migration-ahead": () => onEvent({ phase: "warning", message: liveAheadWarning }),
    "bundle-checked": () => show(upload, "started"),
    uploaded: (progress) => {
      uploadedId = progress.versionId;
      wentLive = progress.live;
      show(upload, "done");
      // Cloudflare made it live with the upload, so the self-test comes after.
      if (wentLive) both({ step: "switch", version });
      selfTestSince = Date.now();
      show({ step: "self-test", version }, "started");
    },
    "self-test-retry": () => {
      const seconds = Math.floor((Date.now() - selfTestSince) / 1000);
      if (seconds > 10) onEvent({ phase: "waiting", step: "self-test", seconds });
    },
    "smoke-test": ({ passed }) => {
      if (!passed) return;
      show({ step: "self-test", version }, "done");
      if (!wentLive) show({ step: "switch", version }, "started");
    },
    switched: () => show({ step: "switch", version }, "done"),
    "workers-dev-left-open": () => onEvent({ phase: "warning", message: workersDevWarning }),
  };
  const report = (progress: DeployProgress): void =>
    (on[progress.step] as ((progress: DeployProgress) => void) | undefined)?.(progress);
  return { report, last: () => last, uploadedId: () => uploadedId, wentLive: () => wentLive };
}

const liveAheadWarning =
  "This version goes live before its self-test: Cloudflare applies a change to the Worker's stored objects only by making it live at once.";

const workersDevWarning =
  "The workers.dev address was off before this deploy and couldn't be turned off again. Turn it off in the Cloudflare dashboard if you don't want it.";
