import { fileURLToPath } from "node:url";
import { createCloudflareClient } from "@halonicjs/target-cloudflare-deploy";
import {
  buildTestWorker,
  compatibilityDate,
  mirrorCases,
  RemoteRunner,
} from "@halonicjs/target-cloudflare-testing";
import { afterAll } from "vitest";
import { deployAdapterRunner } from "../src/adapter-runner.ts";
import { createCloudflareRest } from "../src/cloudflare-rest.ts";

/** Names the missing variables, never a value. */
function required(name: string): string {
  const value = process.env[name] ?? "";
  if (value === "") throw new Error(`The live adapter suites can't run. Missing: ${name}.`);
  return value;
}

const storage = (file: string) =>
  fileURLToPath(new URL(`../../../adapters/cloudflare-storage/src/${file}`, import.meta.url));

// Run by `pnpm test:live`, never by `pnpm test`: the adapters' own contract suites (R2 blobs and
// definitions, D1 records and tokens), run inside a test Worker deployed to the CI Cloudflare
// account, over real R2 and D1 (HAL-6703).
const token = required("CLOUDFLARE_LIVE_API_TOKEN");
const prefix = `${required("HALONIC_LIVE_PREFIX")}-adapters`;
const script = await buildTestWorker([
  storage("blob-store.workerd.test.ts"),
  storage("r2-definition-source.workerd.test.ts"),
  storage("record-store.workerd.test.ts"),
]);
// Register the runner's token with GitHub Actions before it goes anywhere, so no log line can show it.
const runnerToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
  b.toString(16).padStart(2, "0"),
).join("");
if (process.env["GITHUB_ACTIONS"] === "true") console.log(`::add-mask::${runnerToken}`);
const runner = await deployAdapterRunner({
  randomSecret: () => runnerToken,
  api: createCloudflareClient({ token }),
  rest: createCloudflareRest({ token }),
  accountId: required("CLOUDFLARE_LIVE_ACCOUNT_ID"),
  prefix,
  script,
  compatibilityDate,
});
afterAll(() => runner.destroy());

try {
  const remote = new RemoteRunner(runner.url, runner.token);
  mirrorCases((await remote.cases()).children, remote);
} catch (error) {
  // If collection fails, the file fails before any test runs and afterAll may never run.
  await runner.destroy();
  throw error;
}
