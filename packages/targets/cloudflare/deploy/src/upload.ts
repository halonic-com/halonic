import { createHash } from "node:crypto";
import type {
  CloudflareApi,
  DeployedVersion,
  DurableObjectMigration,
  WorkerUpload,
} from "./api.ts";
import { DeployError, type LiveReason, redact, SmokeTestFailedError } from "./errors.ts";
import { selfTest } from "./self-test.ts";

/** The variable that opens the Worker's `/self-test` route; the same name the runtime reads. */
const selfTestTokenVariable = "HALONIC_SELFTEST_TOKEN";
/** Self-test tries on an address that was already on: about 20 s. */
const attemptsWhenOpen = 5;
/**
 * Self-test tries on a workers.dev address this deploy turned on: about two minutes. Cloudflare's
 * edge answers 404 for a new address until it reaches the Worker, longer than 20 s (HAL-13834).
 */
const attemptsWhenNew = 16;
/**
 * How often a live deploy reads its version id back after the self-test: waits of 2, 4, 6, 8 and
 * then 10 s, about a minute. Cloudflare can take longer than 10 s to list the deployment of an
 * upload it took, more so while several deploys run at once (HAL-13838, HAL-14021).
 */
const deploymentLookups = 9;
/** The longest wait between two tries. */
const longestWaitMs = 10_000;

/** What one upload step reports. The CLI formats these later. */
export type UploadProgress =
  | { readonly step: "bundle-checked"; readonly hash: string }
  /** A live upload has no id yet: it is read back after the self-test, and `switched` never comes. */
  | { readonly step: "uploaded"; readonly versionId?: string; readonly live: boolean }
  /** The address didn't answer yet, so the self-test tries again: try `attempt` of `attempts` at most. */
  | { readonly step: "self-test-retry"; readonly attempt: number; readonly attempts: number }
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
  /**
   * How often the self-test is tried while the address starts answering. Defaults to 5 (about
   * 20 s), or 16 (about two minutes) when the deploy turned workers.dev on. Either way the
   * self-test stops after two and a half minutes.
   */
  readonly attempts?: number;
}

/** Waits for real; tests inject `sleep` instead. */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  // A live upload serves all traffic and only it holds this upload's token, so its self-test
  // needs no version id.
  const darkId = goesLive
    ? await api.uploadWorkerLive(accountId, worker, upload, migrations).then(() => undefined)
    : await uploadDark(api, options, upload, serving);
  report({ step: "uploaded", ...(darkId ? { versionId: darkId } : {}), live: goesLive });

  const result = await selfTestOpen(api, options, {
    versionId: darkId,
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
  if (darkId === undefined) return { versionId: await liveVersionId(api, options, previous) };
  await options.beforeTraffic?.();
  await api.deployVersions(accountId, worker, [{ id: darkId, percentage: 100 }]);
  report({ step: "switched", versionId: darkId });
  return { versionId: darkId };
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
    // A first deploy's address, or one that was off, is new: give Cloudflare's edge time to route it.
    const attempts =
      options.attempts ?? (run.keepOpen || closeAfter ? attemptsWhenNew : attemptsWhenOpen);
    result = await selfTest(url, worker, run.versionId, run.token, { ...options, attempts });
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

/**
 * The id of the version a live upload deployed, once Cloudflare lists it. A listing that still
 * names a version from before the upload is as stale as an empty one.
 */
async function liveVersionId(
  api: CloudflareApi,
  options: UploadAndSwitchOptions,
  previous: readonly DeployedVersion[] | undefined,
): Promise<string> {
  const sleep = options.sleep ?? realSleep;
  const before = new Set((previous ?? []).map((v) => v.id));
  for (let lookup = 1; lookup <= deploymentLookups; lookup += 1) {
    const now = await api.currentDeployment(options.accountId, options.worker);
    const id = now?.[0]?.id;
    if (id && !before.has(id)) return id;
    if (lookup < deploymentLookups) await sleep(Math.min(2000 * lookup, longestWaitMs));
  }
  throw new DeployError(
    "cloudflare-request-failed",
    "The new version is deployed and passed its self-test, but Cloudflare lists no deployment for the Worker, so its version id is unknown. The Worker's deployments in the Cloudflare dashboard show it.",
  );
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
