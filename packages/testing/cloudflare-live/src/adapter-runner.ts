import { createHash } from "node:crypto";
import {
  type CloudflareApi,
  provision,
  resourcesFor,
  type UploadAndSwitchOptions,
  uploadAndSwitch,
} from "@halonicjs/target-cloudflare-deploy";
import type { CloudflareRest } from "./cloudflare-rest.ts";
import { fixtureWorkerName } from "./fixture.ts";
import { teardownFor } from "./teardown.ts";
import { workersDevUrlFor } from "./workers-dev.ts";

export interface AdapterRunnerOptions {
  readonly api: CloudflareApi;
  readonly rest: CloudflareRest;
  readonly accountId: string;
  /** `hlt-<run>-<attempt>-adapters`: every name the runner makes starts with it, so the sweeper can find a leftover. */
  readonly prefix: string;
  /** The test Worker's script, from `buildTestWorker`. */
  readonly script: string;
  readonly compatibilityDate: string;
  /** Tests inject this; defaults to 32 random bytes as hex. */
  readonly randomSecret?: () => string;
  /** Durable Object classes the script exports, bound by name and created by one migration. */
  readonly durableObjects?: readonly { readonly binding: string; readonly className: string }[];
  /** Tests inject this: passed to the upload's self-test. */
  readonly upload?: Pick<UploadAndSwitchOptions, "fetch" | "sleep" | "attempts">;
}

/** The test Worker deployed with real storage, as the runner calls it. */
export interface DeployedAdapterRunner {
  /** The Worker's workers.dev address. */
  readonly url: string;
  /** What the Worker wants as its bearer token. Never print it. */
  readonly token: string;
  /** Deletes everything the runner made. Safe to call twice. */
  destroy(): Promise<void>;
}

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deploys the test Worker, with a D1 database and two R2 buckets bound as `DB`, `BLOBS` and
 * `DEFINITIONS` (and any Durable Object classes asked for), into the live test account, so the adapters' contract suites run on the real
 * services (HAL-6703). If a step fails, what was made so far is deleted and the error is thrown.
 *
 * @throws Error when the prefix doesn't start with `hlt-`, or a Cloudflare call fails
 */
export async function deployAdapterRunner(
  options: AdapterRunnerOptions,
): Promise<DeployedAdapterRunner> {
  const { api, rest, accountId, prefix } = options;
  if (!/^hlt-[a-z0-9][a-z0-9-]*$/.test(prefix)) {
    throw new RangeError(`A live runner's names start with "hlt-", not "${prefix}".`);
  }
  const random = options.randomSecret ?? newSecret;
  const durableObjects = options.durableObjects ?? [];
  const worker = fixtureWorkerName(prefix);
  const database = resourcesFor(worker)[0]?.name ?? "";
  const blobs = `${worker}-blobs`;
  const definitions = `${worker}-defs`;
  const destroy = teardownFor({
    api,
    rest,
    accountId,
    worker,
    database,
    buckets: [definitions, blobs],
  });

  try {
    await provision(api, { accountId, worker });
    await api.createResource(accountId, { kind: "bucket", name: definitions, markedIn: database });
    const databaseId = await rest.d1DatabaseId(accountId, database);
    const token = random();
    await uploadAndSwitch(api, {
      accountId,
      worker,
      bundle: {
        script: options.script,
        hash: createHash("sha256").update(options.script, "utf8").digest("hex"),
      },
      compatibilityDate: options.compatibilityDate,
      bindings: [
        { type: "d1", name: "DB", id: databaseId },
        { type: "r2_bucket", name: "BLOBS", bucket_name: blobs },
        { type: "r2_bucket", name: "DEFINITIONS", bucket_name: definitions },
        ...durableObjects.map(({ binding, className }) => ({
          type: "durable_object_namespace",
          name: binding,
          class_name: className,
        })),
      ],
      ...(durableObjects.length > 0
        ? {
            durableObjectMigrations: [
              { tag: "v1", new_sqlite_classes: durableObjects.map((o) => o.className) },
            ],
          }
        : {}),
      secrets: { HALONIC_TEST_RUNNER_TOKEN: token },
      message: "live adapter suites",
      ...options.upload,
    });
    const subdomain = await rest.workersSubdomain(accountId);
    const url = await workersDevUrlFor(
      api,
      accountId,
      worker,
      `${worker}.${subdomain}.workers.dev`,
      {
        ...(options.upload?.sleep ? { sleep: options.upload.sleep } : {}),
      },
    );
    return { url, token, destroy };
  } catch (error) {
    await destroy().catch((cleanup: unknown) => {
      const reason = cleanup instanceof Error ? cleanup.message : String(cleanup);
      throw new Error(`${error instanceof Error ? error.message : String(error)} (${reason})`, {
        cause: error,
      });
    });
    throw error;
  }
}
