import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { hasBudget } from "./has-budget.ts";

verifies("workspace.has-budget", () => {
  describe("has a budget", () => {
    it("holds for a per-run or a monthly amount", () => {
      expect(hasBudget({ currency: "EUR", monthly: 50 })).toBe(true);
      expect(hasBudget({ currency: "EUR", perRun: 5 })).toBe(true);
    });

    it("does not hold for no budget or a currency alone", () => {
      expect(hasBudget(undefined)).toBe(false);
      expect(hasBudget({ currency: "USD" })).toBe(false);
    });
  });
});
