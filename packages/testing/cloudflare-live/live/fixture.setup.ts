import { createCloudflareClient } from "@halonicjs/target-cloudflare-deploy";
import { buildWorkerBundle } from "@halonicjs/tooling-publish";
import { createCloudflareRest } from "../src/cloudflare-rest.ts";
import { deployWebhookFixture } from "../src/fixture.ts";
import { targetVariables } from "../src/live-target.ts";
import { workerSource } from "../src/worker-source.ts";

/** Names the missing variables, never a value. */
function required(name: string): string {
  const value = process.env[name] ?? "";
  if (value === "") {
    throw new Error(`The live fixture can't deploy a Worker. Missing: ${name}.`);
  }
  return value;
}

/**
 * Deploys the Worker the live suites call and tears it down at the end, in the CI account. A run
 * that already names a Worker (all three `HALONIC_LIVE_*` variables set) calls that one instead.
 */
// biome-ignore lint/style/noDefaultExport: Vitest reads globalSetup from the default export.
export default async function setup(): Promise<() => Promise<void>> {
  if (targetVariables.every((name) => (process.env[name] ?? "") !== "")) return async () => {};

  const token = required("CLOUDFLARE_LIVE_API_TOKEN");
  const { entry, compatibilityDate } = workerSource();

  const fixture = await deployWebhookFixture({
    api: createCloudflareClient({ token }),
    rest: createCloudflareRest({ token }),
    accountId: required("CLOUDFLARE_LIVE_ACCOUNT_ID"),
    prefix: required("HALONIC_LIVE_PREFIX"),
    bundle: await buildWorkerBundle(entry),
    compatibilityDate,
  });
  // GitHub Actions hides a registered value from the log.
  if (process.env["GITHUB_ACTIONS"] === "true") {
    console.log(`::add-mask::${fixture.env.HALONIC_LIVE_WEBHOOK_SECRET}`);
  }
  Object.assign(process.env, fixture.env);
  return () => fixture.destroy();
}
