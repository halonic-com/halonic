import { describe, expect, it } from "vitest";
import { fixtureRunWorkflow } from "../src/fixture.ts";
import { liveRunTarget } from "../src/live-target.ts";
import { runChecks } from "../src/run-checks.ts";

// Run by `pnpm test:live`, never by `pnpm test`: it calls a Worker deployed in the CI Cloudflare
// account (cloudflare-live.runs).
describe("runs on the deployed Worker", () => {
  const target = liveRunTarget(process.env);

  it("runs a mock-model workflow to run.completed", async () => {
    await expect(runChecks.runToCompletion(target, fixtureRunWorkflow)).resolves.toBeUndefined();
  });
});
