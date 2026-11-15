import type { CloudflareApi } from "@halonicjs/target-cloudflare-deploy";
import type { CloudflareRest } from "./cloudflare-rest.ts";

export interface TeardownOptions {
  readonly api: CloudflareApi;
  readonly rest: CloudflareRest;
  readonly accountId: string;
  readonly worker: string;
  readonly database: string;
  /** Buckets to empty and delete, in this order. */
  readonly buckets: readonly string[];
  /** Objects the fixture wrote itself: `[bucket, key]`. Deleted before the bucket is emptied. */
  readonly written?: readonly (readonly [string, string])[];
}

/**
 * The function that deletes what a live fixture made: the Worker, its objects, buckets and
 * database. It tries every step, and throws once at the end if any failed (the sweeper deletes
 * what is left). After a clean run it does nothing, so it is safe to call twice.
 */
export function teardownFor(options: TeardownOptions): () => Promise<void> {
  const { api, rest, accountId, worker, database, buckets } = options;
  let destroyed = false;
  return async () => {
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
    for (const [bucket, key] of options.written ?? []) {
      await attempt(`object ${key}`, () => rest.deleteObject(accountId, bucket, key));
    }
    // The Worker may have written to a bucket, and Cloudflare deletes only empty buckets.
    for (const bucket of buckets) {
      await attempt(`objects in ${bucket}`, () => rest.emptyBucket(accountId, bucket));
    }
    for (const bucket of buckets) {
      await attempt(`bucket ${bucket}`, () =>
        api.deleteResource(accountId, { kind: "bucket", name: bucket }),
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
  };
}
