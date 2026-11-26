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
      expect.objectContaining({ jobKey: "board-check", schedule: "*/10 * * * *" }),
      expect.objectContaining({ jobKey: "merge-control", schedule: "* * * * *" }),
      expect.objectContaining({ jobKey: "precheck-wake", schedule: "* * * * *" }),
    ]);
    // Without a token set, the job skips the company and touches nothing.
    await harness.runJob("pr-watch");
    expect(harness.logs.map((log) => log.message)).toEqual([
      "PR watcher: no GitHub token set for this company, skipped.",
    ]);
  });

  // The host's plugin-config-validator swaps a stored secret binding for its id string
  // before it checks the schema, so an object schema here refuses every saved token.
  test("declares each secret setting as a string, the shape the host checks", () => {
    const settings = Object.entries(manifest.instanceConfigSchema?.["properties"] ?? {});
    const secrets = settings.filter(([, schema]) => schema.format === "secret-ref");
    // Every new secret setting is listed here on purpose, so the guard's reviewer sees it (HAL-16876).
    expect(secrets.map(([key]) => key)).toEqual([
      "githubToken",
      "mergeQueueToken",
      "branchUpdateToken",
      "paperclipApiKey",
      "frontBotAnthropicKey",
      "taggerAnthropicKey",
      "trialResultsTokenRef",
    ]);
    for (const [, schema] of secrets) {
      expect(schema).toMatchObject({ type: "string" });
      expect(schema).not.toHaveProperty("properties");
      expect(schema).not.toHaveProperty("required");
    }
  });
});
