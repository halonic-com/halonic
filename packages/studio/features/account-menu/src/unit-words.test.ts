import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { unitName } from "./unit-words.ts";

verifies("account-menu.usage-banner", () => {
  describe("unitName", () => {
    it("names agent time from both its keys: a plan stop's and the usage account's", () => {
      expect(unitName("harnessMinutes")).toBe("agent time");
      expect(unitName("harnessMs")).toBe("agent time");
    });

    it("reads cost as usage and has no name for a unit the flows don't name", () => {
      expect(unitName("cost")).toBe("usage");
      expect(unitName("cacheTokens")).toBeUndefined();
    });
  });
});
