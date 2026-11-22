import { verifies } from "@halonicjs/testing-spec";
import type { Company } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { expect, test } from "vitest";
import { manifest } from "./manifest.ts";
import { plugin } from "./worker.ts";

verifies("paperclip.pr-watcher-plugin", () => {
  test("registers the pr-watch job the manifest schedules every 10 minutes", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({ companies: [{ id: "acme" } as Company] });
    await plugin.definition.setup(harness.ctx);
    expect(manifest.jobs).toEqual([
      expect.objectContaining({ jobKey: "pr-watch", schedule: "*/10 * * * *" }),
    ]);
    // Without a token set, the job skips the company and touches nothing.
    await harness.runJob("pr-watch");
    expect(harness.logs.map((log) => log.message)).toEqual([
      "PR watcher: no GitHub token set for this company, skipped.",
    ]);
  });
});
