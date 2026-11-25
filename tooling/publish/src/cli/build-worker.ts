import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeWorkerFiles } from "../worker-files.ts";

/**
 * Builds the Worker into a folder, `packages/targets/cloudflare/deploy/worker`
 * by default, where the Cloudflare target looks for it in a clone:
 * `pnpm --filter @halonicjs/tooling-publish run build-worker [folder]`.
 * Prints the folder and the script's hash.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const [given] = process.argv.slice(2);
const directory =
  given === undefined ? join(root, "packages/targets/cloudflare/deploy/worker") : resolve(given);
const { hash } = await writeWorkerFiles(root, directory);
console.log(`build-worker: ${directory} (sha256 ${hash})`);
