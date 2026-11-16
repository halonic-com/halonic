import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { firstRunFeature } from "./feature.ts";

verifies("first-run.sample-card", () => {
  describe("firstRunFeature", () => {
    it("is registered under its folder name", () => {
      expect(firstRunFeature.id).toBe("first-run");
    });
  });
});
