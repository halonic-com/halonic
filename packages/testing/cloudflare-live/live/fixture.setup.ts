import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCloudflareClient } from "@halonicjs/target-cloudflare-deploy";
import { buildWorkerBundle } from "@halonicjs/tooling-publish";
import { createCloudflareRest } from "../src/cloudflare-rest.ts";
import { deployWebhookFixture } from "../src/fixture.ts";
import { targetVariables } from "../src/live-target.ts";

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
  const entry = fileURLToPath(import.meta.resolve("@halonicjs/target-cloudflare-runtime"));
  const wrangler = readFileSync(new URL("../wrangler.toml", `file://${entry}`), "utf8");
  const compatibilityDate = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(wrangler)?.[1];
  if (compatibilityDate === undefined) throw new Error("wrangler.toml has no compatibility_date.");

  const fixture = await deployWebhookFixture({
    api: createCloudflareClient({ token }),
    rest: createCloudflareRest({ token }),
    accountId: required("CLOUDFLARE_LIVE_ACCOUNT_ID"),
    prefix: required("HALONIC_LIVE_PREFIX"),
    bundle: await buildWorkerBundle(entry),
    compatibilityDate,
  });
  Object.assign(process.env, fixture.env);
  return () => fixture.destroy();
}
