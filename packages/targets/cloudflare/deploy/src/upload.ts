import { createHash } from "node:crypto";
import type {
  CloudflareApi,
  DeployedVersion,
  DurableObjectMigration,
  WorkerUpload,
} from "./api.ts";
import { DeployError, SmokeTestFailedError } from "./errors.ts";

/** The variable that opens the Worker's `/self-test` route; the same name the runtime reads. */
const selfTestTokenVariable = "HALONIC_SELFTEST_TOKEN";
const overrideHeader = "Cloudflare-Workers-Version-Overrides";

/** What one upload step reports. The CLI formats these later. */
export type UploadProgress =
  | { readonly step: "bundle-checked"; readonly hash: string }
  | { readonly step: "uploaded"; readonly versionId: string; readonly live: boolean }
  | { readonly step: "smoke-test"; readonly passed: boolean }
  | { readonly step: "switched"; readonly versionId: string }
  | { readonly step: "kept-previous"; readonly versionId: string };

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
  const goesLive = previous === undefined || previous.length === 0 || migrations.length > 0;

  const versionId = goesLive
    ? await deployLive(api, options, upload, migrations)
    : await uploadDark(api, options, upload, previous);
  report({ step: "uploaded", versionId, live: goesLive });

  const url = await api.openWorkersDev(accountId, worker);
  const result = await selfTest(url, worker, goesLive ? undefined : versionId, token, options);
  report({ step: "smoke-test", passed: result.ok });
  if (!result.ok) {
    if (!goesLive) await restore(api, accountId, worker, previous, report);
    throw new SmokeTestFailedError(result.failed, !goesLive);
  }
  if (!goesLive) {
    await api.deployVersions(accountId, worker, [{ id: versionId, percentage: 100 }]);
    report({ step: "switched", versionId });
  }
  return { versionId };
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
  return now?.[0]?.id ?? "";
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
