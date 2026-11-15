import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCloudflareClient, withAdminKey } from "@halonicjs/target-cloudflare-deploy";
import { afterAll, describe, expect, it } from "vitest";
import { fixtureWorkerName } from "../src/fixture.ts";
import { eventually, roundTrip, workerChecks } from "../src/transfer-checks.ts";

// Run by `pnpm test:live`, never by `pnpm test`: it calls a Worker deployed in the CI Cloudflare
// account and sets a one-job admin key on it (cloudflare-live.transfer). The example export of
// @halonicjs/format goes in and comes back out; the key's secret is gone afterwards.
const exampleExport = fileURLToPath(
  new URL("../../../core/format/src/runtime-export/fixtures/example", import.meta.url),
);

function required(name: string): string {
  const value = process.env[name] ?? "";
  if (value === "") throw new Error(`The live transfer suite needs ${name}.`);
  return value;
}

describe("the deployed Worker's admin routes", () => {
  const target = { baseUrl: required("HALONIC_LIVE_WORKER_URL") };
  const folders: string[] = [];
  afterAll(async () => {
    await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
  });

  it("answers /health", async () => {
    await expect(workerChecks.smoke(target)).resolves.toBeUndefined();
  });

  it("is closed as a 404 while no admin key is set", async () => {
    await expect(workerChecks.adminClosed(target, "not-the-key")).resolves.toBeUndefined();
  });

  // Two secret changes at a few seconds each, plus the transfer: more than the config's 60 s.
  const transferTimeout = 180_000;
  it(
    "refuses bad keys, takes an export in and gives it back, and is closed again afterwards",
    async () => {
      const api = createCloudflareClient({ token: required("CLOUDFLARE_LIVE_API_TOKEN") });
      const work = await mkdtemp(join(tmpdir(), "hlt-export-"));
      folders.push(work);
      let used = "";

      const result = await withAdminKey(
        api,
        {
          accountId: required("CLOUDFLARE_LIVE_ACCOUNT_ID"),
          worker: fixtureWorkerName(required("HALONIC_LIVE_PREFIX")),
          label: "live test: export and import",
        },
        async (key) => {
          used = key;
          // A new Worker version answers the key a few seconds late; until then the route is still the closed 404.
          await eventually(() => workerChecks.adminKeyActive(target));
          await workerChecks.adminRefusesBadKeys(target, key);
          return roundTrip({ baseUrl: target.baseUrl, key, source: exampleExport, work });
        },
      );
      expect(result.files).toBeGreaterThan(0);

      // Removing a secret makes a new Worker version, which takes a moment to answer everywhere.
      await eventually(() => workerChecks.adminClosed(target, used), { attempts: 6 });
    },
    transferTimeout,
  );
});
