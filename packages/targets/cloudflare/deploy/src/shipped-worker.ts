import { readFile } from "node:fs/promises";
import type { WorkerScript } from "./deploy-target-deploy.ts";
import { portFailure } from "./port-failure.ts";

/**
 * The folder the built Worker sits in: `worker/` at this package's root,
 * where the release build puts it and where `build-worker` writes it in a clone.
 */
const shippedFolder = new URL("../worker/", import.meta.url);

/**
 * Loads the Worker this package ships (requirement `deploy.shipped-worker`):
 * `halonic-worker.js` and the hash, compatibility date and Durable Objects in
 * `halonic-worker.json` beside it. It passes on the manifest's hash, never one
 * worked out here, so the upload's hash check refuses a script that isn't the
 * one the release built. It builds nothing: tests and the live suite give
 * their own loader instead.
 *
 * @param folder - where the two files are; this package's `worker/` by default
 * @returns a loader that rejects with `unexpected` when the files are missing,
 *   and with an error naming the manifest when it isn't one
 */
export function shippedWorker(folder: URL = shippedFolder): () => Promise<WorkerScript> {
  return async () => {
    let script: string;
    let manifest: unknown;
    try {
      script = await readFile(new URL("halonic-worker.js", folder), "utf8");
      manifest = JSON.parse(await readFile(new URL("halonic-worker.json", folder), "utf8"));
    } catch (error) {
      if (!isMissing(error)) throw error;
      throw portFailure(
        "unexpected",
        "internal",
        "This Halonic has no Cloudflare Worker to upload yet.",
        "In a clone of halonic, run pnpm --filter @halonicjs/tooling-publish run build-worker first.",
      );
    }
    if (!isManifest(manifest)) throw new Error("halonic-worker.json isn't a Worker manifest.");
    return { script, ...manifest };
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isManifest(value: unknown): value is Omit<WorkerScript, "script"> {
  if (typeof value !== "object" || value === null) return false;
  const { hash, compatibilityDate, durableObjects, durableObjectMigrations } = value as Record<
    string,
    unknown
  >;
  return (
    typeof hash === "string" &&
    /^[0-9a-f]{64}$/.test(hash) &&
    typeof compatibilityDate === "string" &&
    Array.isArray(durableObjects) &&
    durableObjects.length > 0 &&
    durableObjects.every(
      (binding) => typeof binding?.name === "string" && typeof binding?.class_name === "string",
    ) &&
    Array.isArray(durableObjectMigrations) &&
    durableObjectMigrations.every((migration) => typeof migration?.tag === "string")
  );
}
