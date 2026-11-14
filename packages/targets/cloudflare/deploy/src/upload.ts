import { createHash } from "node:crypto";
import type {
  CloudflareApi,
  DeployedVersion,
  DurableObjectMigration,
  WorkerUpload,
} from "./api.ts";
import { DeployError, type LiveReason, redact, SmokeTestFailedError } from "./errors.ts";

/** The variable that opens the Worker's `/self-test` route; the same name the runtime reads. */
const selfTestTokenVariable = "HALONIC_SELFTEST_TOKEN";
const overrideHeader = "Cloudflare-Workers-Version-Overrides";

/** What one upload step reports. The CLI formats these later. */
export type UploadProgress =
  | { readonly step: "bundle-checked"; readonly hash: string }
  | { readonly step: "uploaded"; readonly versionId: string; readonly live: boolean }
  | { readonly step: "smoke-test"; readonly passed: boolean }
  | { readonly step: "switched"; readonly versionId: string }
  | { readonly step: "kept-previous"; readonly versionId: string }
  /** workers.dev was off before the deploy and could not be turned off again. */
  | { readonly step: "workers-dev-left-open" };

export interface UploadAndSwitchOptions {
  readonly accountId: string;
  readonly worker: string;
  /** The prebuilt Worker and the hash its build reported. */
  readonly bundle: { readonly script: string; readonly hash: string };
  readonly compatibilityDate: string;
  readonly bindings: WorkerUpload["bindings"];
  /** The Worker's own secrets. Sent in the upload; never logged. */
  readonly secrets: WorkerUpload["secrets"];
  /**
   * Durable Object migrations this deploy must apply. Cloudflare applies a class change only
   * with an immediate deploy, so a deploy with migrations (and the first deploy) goes live
   * before its self-test; the progress says so.
   */
  readonly durableObjectMigrations?: readonly DurableObjectMigration[];
  readonly message?: string;
  readonly onProgress?: (event: UploadProgress) => void;
  /** Awaited right before the first call that changes live traffic; throw to stop the deploy. */
  readonly beforeTraffic?: () => Promise<void>;
  /** Tests inject these. */
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly randomToken?: () => string;
  /** How often the self-test is tried while the new address starts answering. Defaults to 5. */
  readonly attempts?: number;
}

/** A 32-byte random token as hex, from the platform's CSPRNG. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Uploads the Worker as a version that serves nothing, runs the Worker's self-test against that
 * version, and switches traffic only if it passed. Otherwise the previous version stays live.
 *
 * Two cases can't be tried first: a Worker that was never deployed has nothing to protect, and
 * Cloudflare only applies Durable Object migrations with an immediate deploy. Those upload live
 * and then run the self-test, and a failure says the new version is deployed.
 *
 * @throws DeployError `bundle-hash-mismatch` when the script isn't the bundle that was built
 * @throws SmokeTestFailedError when the self-test fails
 */
export async function uploadAndSwitch(
  api: CloudflareApi,
  options: UploadAndSwitchOptions,
): Promise<{ readonly versionId: string }> {
  const report = options.onProgress ?? (() => {});
  const { accountId, worker } = options;

  const actual = createHash("sha256").update(options.bundle.script, "utf8").digest("hex");
  if (actual !== options.bundle.hash) {
    throw new DeployError(
      "bundle-hash-mismatch",
      "The Worker script doesn't match the hash its build reported, so it is not uploaded.",
    );
  }
  report({ step: "bundle-checked", hash: actual });

  if (
    selfTestTokenVariable in options.secrets ||
    options.bindings.some((b) => b.name === selfTestTokenVariable)
  ) {
    throw new DeployError(
      "reserved-binding-name",
      `${selfTestTokenVariable} is reserved for the deploy's self-test; use another name.`,
    );
  }

  const token = (options.randomToken ?? newToken)();
  const upload: WorkerUpload = {
    script: options.bundle.script,
    compatibilityDate: options.compatibilityDate,
    bindings: options.bindings,
    secrets: { ...options.secrets, [selfTestTokenVariable]: token },
    ...(options.message ? { message: options.message } : {}),
  };
  const previous = await api.currentDeployment(accountId, worker);
  const migrations = options.durableObjectMigrations ?? [];
  const liveReason = whyLive(previous, migrations);
  const goesLive = liveReason !== undefined;
  const serving = servingVersions(previous, goesLive);

  if (goesLive) await options.beforeTraffic?.();
  const versionId = goesLive
    ? await deployLive(api, options, upload, migrations)
    : await uploadDark(api, options, upload, serving);
  report({ step: "uploaded", versionId, live: goesLive });

  const result = await selfTestOpen(api, options, {
    versionId: goesLive ? undefined : versionId,
    token,
    keepOpen: liveReason === "first-deploy",
    goesLive,
    report,
  });
  report({ step: "smoke-test", passed: result.ok });
  if (!result.ok) {
    throw await failedSelfTest(
      api,
      options,
      upload,
      token,
      serving,
      result.failed,
      liveReason,
      report,
    );
  }
  if (!goesLive) {
    await options.beforeTraffic?.();
    await api.deployVersions(accountId, worker, [{ id: versionId, percentage: 100 }]);
    report({ step: "switched", versionId });
  }
  return { versionId };
}

/**
 * Turns workers.dev on, runs the self-test and puts the setting back. A Worker's first deploy
 * (`keepOpen`) leaves it on: it is the new app's only address. A failed close after a pass throws;
 * after a failing test the self-test failure stays the error and an event says workers.dev is on.
 */
async function selfTestOpen(
  api: CloudflareApi,
  options: UploadAndSwitchOptions,
  run: {
    readonly versionId: string | undefined;
    readonly token: string;
    readonly keepOpen: boolean;
    readonly goesLive: boolean;
    readonly report: (event: UploadProgress) => void;
  },
): Promise<Awaited<ReturnType<typeof selfTest>>> {
  const { accountId, worker } = options;
  const closeAfter = !run.keepOpen && !(await api.workersDevEnabled(accountId, worker));
  const url = await api.openWorkersDev(accountId, worker);
  const putBack = () => (closeAfter ? api.closeWorkersDev(accountId, worker) : Promise.resolve());
  let result: Awaited<ReturnType<typeof selfTest>>;
  try {
    result = await selfTest(url, worker, run.versionId, run.token, options);
  } catch (error) {
    await putBack().catch(() => run.report({ step: "workers-dev-left-open" }));
    throw error;
  }
  try {
    await putBack();
  } catch (cause) {
    run.report({ step: "workers-dev-left-open" });
    if (result.ok) throw closeFailed(run.goesLive, cause);
  }
  return result;
}

/** The self-test passed but workers.dev, which was off before the deploy, is still on. */
function closeFailed(goesLive: boolean, cause: unknown): DeployError {
  const fix =
    "Turn it off in the Cloudflare dashboard (the Worker's Settings, Domains & Routes), then deploy again.";
  const error = new DeployError(
    "cloudflare-request-failed",
    goesLive
      ? `The new version is deployed and passed its self-test, but turning workers.dev off again failed, so workers.dev is still on. ${fix}`
      : `The new version passed its self-test, but turning workers.dev off again failed, so nothing was switched: the previous version is still live and workers.dev is still on. ${fix}`,
  );
  error.cause = cause;
  return error;
}

/** Puts the old version back if there is one to protect, and builds the error to throw. */
async function failedSelfTest(
  api: CloudflareApi,
  options: UploadAndSwitchOptions,
  upload: WorkerUpload,
  token: string,
  serving: readonly DeployedVersion[],
  failed: readonly string[],
  liveReason: LiveReason | undefined,
  report: (event: UploadProgress) => void,
): Promise<SmokeTestFailedError> {
  let restoreFailed = false;
  if (liveReason === undefined) {
    try {
      await restore(api, options.accountId, options.worker, serving, report);
    } catch {
      // The new version has 0% of traffic, so the old one still serves: report the self-test failure.
      restoreFailed = true;
    }
  }
  const names = safeNames(failed, [token, ...Object.values(upload.secrets)]);
  return new SmokeTestFailedError(names, liveReason, restoreFailed);
}

/** Redacts and bounds check names, which a Worker reports about itself. */
function safeNames(names: readonly string[], secrets: readonly string[]): string[] {
  const shown = names.slice(0, 10).map((n) => redact(n, secrets).slice(0, 60));
  return names.length > 10 ? [...shown, `${names.length - 10} more`] : shown;
}

/** Why this deploy can't be tried before it is live, if it can't. */
function whyLive(
  previous: readonly DeployedVersion[] | undefined,
  migrations: readonly DurableObjectMigration[],
): LiveReason | undefined {
  if (!previous || previous.length === 0) return "first-deploy";
  return migrations.length > 0 ? "migration" : undefined;
}

/**
 * The versions that have traffic. A deployment holds two versions at most, so the new 0% version
 * only fits next to one; a split between two stops the deploy before anything is uploaded.
 */
function servingVersions(
  previous: readonly DeployedVersion[] | undefined,
  goesLive: boolean,
): readonly DeployedVersion[] {
  const serving = (previous ?? []).filter((v) => v.percentage > 0);
  if (!goesLive && serving.length >= 2) {
    throw new DeployError(
      "traffic-split-in-progress",
      "Two versions are sharing traffic, so there is no room for a third. Finish or roll back the split in Cloudflare first, then deploy again. Nothing was uploaded.",
    );
  }
  return serving;
}

/** Uploads with the migrations and deploys at once; returns the id of the version now live. */
async function deployLive(
  api: CloudflareApi,
  options: UploadAndSwitchOptions,
  upload: WorkerUpload,
  migrations: readonly DurableObjectMigration[],
): Promise<string> {
  await api.uploadWorkerLive(options.accountId, options.worker, upload, migrations);
  const now = await api.currentDeployment(options.accountId, options.worker);
  const id = now?.[0]?.id;
  if (!id) {
    throw new DeployError(
      "cloudflare-request-failed",
      "Cloudflare took the upload but lists no deployment for the Worker, so the new version can't be tested.",
    );
  }
  return id;
}

/** Uploads a version and gives it 0% next to the previous one, so only the override header reaches it. */
async function uploadDark(
  api: CloudflareApi,
  options: UploadAndSwitchOptions,
  upload: WorkerUpload,
  previous: readonly DeployedVersion[],
): Promise<string> {
  const id = await api.uploadVersion(options.accountId, options.worker, upload);
  await api.deployVersions(options.accountId, options.worker, [...previous, { id, percentage: 0 }]);
  return id;
}

async function restore(
  api: CloudflareApi,
  accountId: string,
  worker: string,
  previous: readonly DeployedVersion[],
  report: (event: UploadProgress) => void,
) {
  await api.deployVersions(accountId, worker, previous);
  report({ step: "kept-previous", versionId: previous[0]?.id ?? "" });
}

/** Calls `POST /self-test` until it answers or the attempts run out. */
async function selfTest(
  baseUrl: string,
  worker: string,
  versionId: string | undefined,
  token: string,
  options: UploadAndSwitchOptions,
): Promise<{ ok: boolean; failed: string[] }> {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = options.attempts ?? 5;
  let failed: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await doFetch(`${baseUrl}/self-test`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          ...(versionId ? { [overrideHeader]: `${worker}="${versionId}"` } : {}),
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const report = (await response.json()) as {
          ok?: boolean;
          checks?: { name?: string; ok?: boolean }[];
        };
        failed = (report.checks ?? []).filter((c) => !c.ok).map((c) => String(c.name));
        // A report that says "not ok" is an answer, not a Worker still starting: don't retry it.
        return { ok: report.ok === true, failed };
      }
      failed = [`HTTP ${response.status}`];
    } catch {
      failed = ["no answer"];
    }
    if (attempt < attempts) await sleep(2000 * attempt);
  }
  return { ok: false, failed };
}
