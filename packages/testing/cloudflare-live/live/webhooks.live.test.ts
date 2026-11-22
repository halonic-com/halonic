import { describe, expect, it } from "vitest";
import { liveWebhookTarget } from "../src/live-target.ts";
import { webhookChecks } from "../src/webhook-checks.ts";

// Run by `pnpm test:live`, never by `pnpm test`: it calls a Worker deployed in the CI Cloudflare
// account (cloudflare-live.webhooks).
describe("webhooks of the deployed Worker", () => {
  const target = liveWebhookTarget(process.env);

  it("refuses a wrong signature", async () => {
    await expect(webhookChecks.badSignature(target)).resolves.toBeUndefined();
  });
  it("refuses a signed delivery with an old timestamp", async () => {
    await expect(webhookChecks.staleTimestamp(target)).resolves.toBeUndefined();
  });
  it("answers an unknown address as a wrong signature", async () => {
    await expect(webhookChecks.unknownAddress(target)).resolves.toBeUndefined();
  });
  it("starts the routine's run for a signed delivery", async () => {
    await expect(webhookChecks.runStart(target)).resolves.toBeUndefined();
  });
  it("refuses a repeated delivery id", async () => {
    await expect(webhookChecks.replay(target)).resolves.toBeUndefined();
  });
});
