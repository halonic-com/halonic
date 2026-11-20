import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCloudflareClient, withAdminKey } from "@halonicjs/target-cloudflare-deploy";
import { afterAll, describe, expect, it } from "vitest";
import { eventually } from "../src/eventually.ts";
import { fixtureWorkerName } from "../src/fixture.ts";
import { roundTrip, UnexpectedStatus, workerChecks } from "../src/transfer-checks.ts";
import { EdgeNotRouted } from "../src/worker-call.ts";

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

  // While the key rolls out, an older Worker version still gives the closed 404, and on CI a try a
  // few seconds after the key was set has met a 500 (HAL-14453): retry only those, so any other
  // wrong answer, such as a wrong key taken, fails at once. A 500 that lasts still fails at the end.
  const olderVersionAnswered = (error: unknown) =>
    error instanceof UnexpectedStatus && (error.status === 404 || error.status >= 500);

  // Each retried failure is printed with its try and time, so a run that runs out of tries shows
  // how long the older version kept answering. The checks' messages never hold a key.
  const report = (wait: string) => (attempt: number, elapsedMs: number, error: unknown) =>
    console.log(
      `${wait}, try ${attempt} at ${Math.round(elapsedMs / 1000)} s: ${error instanceof Error ? error.message : String(error)}`,
    );

  // Two secret changes, each waited out with several passes in a row (up to about a minute for the
  // key, a minute and a half for its removal), plus the transfer: more than the config's 60 s.
  const transferTimeout = 300_000;
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
          // A new Worker version answers the key a few seconds late, and until it answers everywhere an
          // older one still gives the closed 404. The whole sweep must pass several times in a row,
          // so the last sweep has every answer a 401 from the version with the key.
          await eventually(
            async () => {
              await workerChecks.adminKeyActive(target);
              await workerChecks.adminRefusesBadKeys(target, key);
            },
            { retryIf: olderVersionAnswered, onRetry: report("waiting for the key") },
          );
          return roundTrip({ baseUrl: target.baseUrl, key, source: exampleExport, work });
        },
      );
      expect(result.files).toBeGreaterThan(0);

      // Removing a secret makes a new Worker version, which takes a moment to answer everywhere.
      // Until then an older one still takes the key, and its answer depends on the route, so every
      // failure is retried, but only a run of passes counts. On CI an older version kept the key
      // for more than the 35 s that 8 tries wait, so this waits as long as 16 tries (HAL-14453). An
      // edge that doesn't route the address has had its whole wait already, so trying it again
      // would only multiply that (HAL-14054).
      await eventually(() => workerChecks.adminClosed(target, used), {
        attempts: 16,
        retryIf: (error) => !(error instanceof EdgeNotRouted),
        onRetry: report("waiting for the key to go"),
      });
    },
    transferTimeout,
  );
});
