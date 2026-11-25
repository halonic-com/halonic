import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { rowCostWords, summaryWords } from "./app-run.ts";

verifies("runs.app-list", () => {
  describe("rowCostWords", () => {
    it("says nothing for a run with no cost, and uses each currency's own decimals", () => {
      expect(rowCostWords({ kind: "none" }, false)).toBeUndefined();
      expect(rowCostWords({ kind: "money", currency: "JPY", minorUnits: 150 }, false)).toBe(
        "¥150.00",
      );
    });
  });

  describe("summaryWords", () => {
    it("shows each currency apart, never added together", () => {
      expect(
        summaryWords({
          runs: 2,
          failed: 0,
          running: 0,
          money: [
            { currency: "EUR", minorUnits: 11 },
            { currency: "USD", minorUnits: 10 },
          ],
        }),
      ).toBe("Today: 2 runs · 0 failed · €0.11 · $0.10");
    });
  });
});
