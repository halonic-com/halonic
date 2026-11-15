import { writeDefinitionSnapshot } from "@halonicjs/adapter-cloudflare-storage";
import {
  type CloudflareApi,
  provision,
  resourcesFor,
  type UploadAndSwitchOptions,
  uploadAndSwitch,
} from "@halonicjs/target-cloudflare-deploy";
import type { CloudflareRest } from "./cloudflare-rest.ts";
import type { targetVariables } from "./live-target.ts";

/** The routine the fixture deploys: `acme/orders`, signed with the secret `live-hook`. */
export const fixtureAddress = "acme/orders";

const routineFile = [
  "id: orders",
  "name: Orders",
  "trigger: { webhook: { secret: live-hook } }",
  "run: { workflow: handle-order, input: { order: '{{trigger.body.id}}' } }",
].join("\n");

/** The Durable Object classes of the Worker, as `wrangler.toml` lists them (migration `v1`). */
const durableObjects = [
  { name: "COORDINATION", class_name: "CoordinationObject" },
  { name: "RUN", class_name: "RunObject" },
  { name: "ROUTINES", class_name: "RoutinesObject" },
] as const;

export interface FixtureOptions {
  readonly api: CloudflareApi;
  readonly rest: CloudflareRest;
  readonly accountId: string;
  /** `hlt-<run>-<attempt>`: every name the fixture makes starts with it, so the sweeper can find a leftover. */
  readonly prefix: string;
  /** The Worker, built by `buildWorkerBundle`. */
  readonly bundle: { readonly script: string; readonly hash: string };
  readonly compatibilityDate: string;
  /** Tests inject this; defaults to 32 random bytes as hex. */
  readonly randomSecret?: () => string;
  /** Tests inject this: passed to the upload's self-test. */
  readonly upload?: Pick<UploadAndSwitchOptions, "fetch" | "sleep" | "attempts">;
}

/** A Worker deployed for the live suites. */
export interface DeployedFixture {
  /** The variables `liveWebhookTarget` reads. */
  readonly env: Readonly<Record<(typeof targetVariables)[number], string>>;
  /** Deletes everything the fixture made. Safe to call twice. */
  destroy(): Promise<void>;
}

/** The Worker's name for a prefix: the fixture makes it, and the live suites that set an admin key on it find it again. */
export function fixtureWorkerName(prefix: string): string {
  return `${prefix}-w`;
}

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deploys a Worker with one enabled webhook routine into the live test account: database and
 * buckets, the snapshot with the routine, the upload, workers.dev. If any step fails, what was
 * made so far is deleted and the error is thrown.
 *
 * @throws Error when the prefix doesn't start with `hlt-`, or a Cloudflare call fails
 */
export async function deployWebhookFixture(options: FixtureOptions): Promise<DeployedFixture> {
  const { api, rest, accountId, prefix } = options;
  if (!/^hlt-[a-z0-9][a-z0-9-]*$/.test(prefix)) {
    throw new RangeError(`A live fixture's names start with "hlt-", not "${prefix}".`);
  }
  const random = options.randomSecret ?? newSecret;
  const worker = fixtureWorkerName(prefix);
  const database = resourcesFor(worker)[0]?.name ?? "";
  const blobs = `${worker}-blobs`;
  const definitions = `${worker}-defs`;
  const written: string[] = [];

  let destroyed = false;
  async function destroy(): Promise<void> {
    if (destroyed) return;
    const failures: string[] = [];
    const attempt = async (what: string, step: () => Promise<void>) => {
      try {
        await step();
      } catch (error) {
        failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    await attempt("worker", () => api.deleteResource(accountId, { kind: "worker", name: worker }));
    for (const key of written) {
      await attempt(`object ${key}`, () => rest.deleteObject(accountId, definitions, key));
    }
    // The Worker may have written to the blobs bucket, and Cloudflare deletes only empty buckets.
    await attempt(`objects in ${blobs}`, () => rest.emptyBucket(accountId, blobs));
    for (const name of [definitions, blobs]) {
      await attempt(`bucket ${name}`, () =>
        api.deleteResource(accountId, { kind: "bucket", name }),
      );
    }
    await attempt("database", () =>
      api.deleteResource(accountId, { kind: "database", name: database }),
    );
    if (failures.length === 0) destroyed = true;
    else {
      throw new Error(
        `The fixture left something behind (the sweeper deletes it): ${failures.join("; ")}`,
      );
    }
  }

  try {
    const subdomain = await rest.workersSubdomain(accountId);
    const host = `${worker}.${subdomain}.workers.dev`;
    await provision(api, { accountId, worker });
    await api.createResource(accountId, { kind: "bucket", name: definitions, markedIn: database });
    const databaseId = await rest.d1DatabaseId(accountId, database);

    await writeDefinitionSnapshot(
      {
        async put(key, value) {
          written.push(key);
          await rest.putObject(
            accountId,
            definitions,
            key,
            typeof value === "string" ? value : new TextDecoder().decode(value),
          );
        },
      },
      { "hubs/acme/workflows/routines/orders.routine.yaml": routineFile },
    );

    const webhookSecret = random();
    await uploadAndSwitch(api, {
      accountId,
      worker,
      bundle: options.bundle,
      compatibilityDate: options.compatibilityDate,
      bindings: [
        ...durableObjects.map((binding) => ({ type: "durable_object_namespace", ...binding })),
        { type: "d1", name: "DB", id: databaseId },
        { type: "r2_bucket", name: "BLOBS", bucket_name: blobs },
        { type: "r2_bucket", name: "DEFINITIONS", bucket_name: definitions },
        { type: "plain_text", name: "HALONIC_ALLOWED_HOSTS", text: host },
        { type: "plain_text", name: "HALONIC_DEPLOYMENT_ID", text: prefix },
      ],
      secrets: {
        HALONIC_SECRET_TOKEN_KEY: random(),
        HALONIC_SECRET_SERVE_PASSWORD: random(),
        HALONIC_SECRET_LIVE_HOOK: webhookSecret,
      },
      durableObjectMigrations: [
        { tag: "v1", new_sqlite_classes: durableObjects.map((binding) => binding.class_name) },
      ],
      message: "live test fixture",
      ...options.upload,
    });

    const url = await api.workersDevUrl(accountId, worker);
    if (url === undefined || new URL(url).host !== host) {
      throw new Error("The Worker's workers.dev address is not the host the Worker answers to.");
    }
    return {
      env: {
        HALONIC_LIVE_WORKER_URL: url,
        HALONIC_LIVE_WEBHOOK_ADDRESS: fixtureAddress,
        HALONIC_LIVE_WEBHOOK_SECRET: webhookSecret,
      },
      destroy,
    };
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
