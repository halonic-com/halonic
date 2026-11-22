import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type RunFailedEvent, runFailureOf } from "./run-failure.ts";

/** A `run.failed` event with the cause `code` and its `detail`. */
function failedWith(code: string, detail: Record<string, string>): RunFailedEvent {
  return {
    runId: "01JD8Q",
    seq: 9,
    at: "2026-11-10T09:00:00.000Z",
    type: "run.failed",
    state: "draft",
    error: "the engine's own words",
    reason: "error",
    cause: { kind: "denied", code, detail },
  };
}

const general = { reason: "error", message: "the engine's own words" };

// A key or provider the model check refused (HAL-15333), apart from
// run-failure.test.ts to keep each file under 500 lines.
verifies("app.run-failure", () => {
  describe("the key-address check", () => {
    it("names a key or provider the model check refused, as the workspace's setup (HAL-15333)", () => {
      const facts = (code: string, detail: Record<string, string>) =>
        runFailureOf(failedWith(code, detail), undefined);
      const provider = "gateway";
      const origin = "https://other.example.com";

      expect(facts("models.key-origin-not-allowed", { provider, key: "gw-key", origin })).toEqual({
        reason: "key-address-not-allowed",
        provider,
        key: "gw-key",
        address: origin,
      });
      // The list that refused, when the cause names one Halonic knows (HAL-15762).
      expect(
        facts("models.key-origin-not-allowed", {
          provider,
          key: "gw-key",
          origin,
          store: "secrets-file",
        }),
      ).toEqual({
        reason: "key-address-not-allowed",
        provider,
        key: "gw-key",
        address: origin,
        store: "secrets-file",
      });
      expect(
        facts("models.key-origin-not-allowed", { provider, key: "gw-key", origin, store: "vault" }),
      ).toEqual({ reason: "key-address-not-allowed", provider, key: "gw-key", address: origin });
      expect(facts("models.untrusted-provider-address", { provider, origin })).toEqual({
        reason: "key-address-not-trusted",
        provider,
        address: origin,
      });
      expect(facts("models.untrusted-workspace", { provider })).toEqual({
        reason: "workspace-not-trusted",
        provider,
      });
      expect(facts("models.untrusted-provider-address", { provider })).toEqual(general);
      expect(facts("models.untrusted-workspace", {})).toEqual(general);
    });
  });
});
