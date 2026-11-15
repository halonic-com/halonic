import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { liveWebhookTarget } from "./live-target.ts";

const env = {
  HALONIC_LIVE_WORKER_URL: "https://hlt-1-1.example.workers.dev",
  HALONIC_LIVE_WEBHOOK_ADDRESS: "acme/orders",
  HALONIC_LIVE_WEBHOOK_SECRET: "made-up-secret-value",
};

verifies("cloudflare-live.webhooks", () => {
  describe("the Worker the live suites call", () => {
    it("is read from the environment", () => {
      expect(liveWebhookTarget(env)).toEqual({
        baseUrl: env.HALONIC_LIVE_WORKER_URL,
        address: "acme/orders",
        secret: env.HALONIC_LIVE_WEBHOOK_SECRET,
      });
    });

    it("is refused with the names of what is missing, and no value", () => {
      const error = (() => {
        try {
          liveWebhookTarget({
            ...env,
            HALONIC_LIVE_WEBHOOK_ADDRESS: "",
            HALONIC_LIVE_WEBHOOK_SECRET: undefined,
          });
          return undefined;
        } catch (caught) {
          return caught as Error;
        }
      })();
      expect(error?.message).toBe(
        "The live suites have no Worker to call. Missing: HALONIC_LIVE_WEBHOOK_ADDRESS, HALONIC_LIVE_WEBHOOK_SECRET.",
      );
    });
  });
});
