import type { UsageRefusal } from "@halonicjs/adapter-cloudflare-durable";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { stopOfRefusal } from "./usage-stops.ts";

const costReached: UsageRefusal = {
  code: "plan.cost",
  unit: "cost",
  used: 5_000_000,
  limit: 5_000_000,
  needed: 0,
  left: 0,
  resetsAt: Date.UTC(2026, 11, 1),
};

verifies("runtime.limits-plan", () => {
  describe("a stop under a limits document", () => {
    it("names the document's plan", () => {
      const plan = { id: "pro", version: 3, name: "Pro" };
      const stop = stopOfRefusal({ ...costReached, plan }, "check");
      expect(stop.cause.detail).toMatchObject({
        planId: "pro",
        planVersion: "3",
        planName: "Pro",
      });
    });

    it("names the Cloud placeholder when the document has no plan", () => {
      const stop = stopOfRefusal(costReached, "check");
      expect(stop.cause.detail).toMatchObject({ planId: "cloud", planVersion: "0", planName: "" });
    });
  });
});
