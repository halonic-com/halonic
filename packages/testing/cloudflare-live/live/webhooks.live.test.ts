import { describe, expect, it } from "vitest";
import { liveWebhookTarget } from "../src/live-target.ts";
import { webhookChecks } from "../src/webhook-checks.ts";

// Run by `pnpm test:live`, never by `pnpm test`: it calls a Worker deployed in the CI Cloudflare
// account. The signature, old-timestamp and unknown-address checks are live. The run-start and replay checks are
// pending: they pass while the Worker answers 501 and fail the day it starts runs (live.webhooks).
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
  it("pending: answers a signed delivery 501 until runs start", async () => {
    await expect(webhookChecks.runStartPending(target)).resolves.toBeUndefined();
  });
  it("pending: answers a repeated delivery id 501 until runs start", async () => {
    await expect(webhookChecks.replayPending(target)).resolves.toBeUndefined();
  });
});
