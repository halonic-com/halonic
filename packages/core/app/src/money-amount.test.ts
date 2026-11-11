import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { moneyAmount } from "./money-amount.ts";

verifies("app.money-amount", () => {
  describe("moneyAmount", () => {
    it("writes two decimals from one cent up", () => {
      expect(moneyAmount(5.08)).toBe("€5.08");
      expect(moneyAmount(50)).toBe("€50.00");
      expect(moneyAmount(0.01)).toBe("€0.01");
    });

    it("writes three decimals below one cent, so a cheap run never reads as free", () => {
      expect(moneyAmount(0.004)).toBe("€0.004");
      expect(moneyAmount(0.009)).toBe("€0.009");
    });

    it("writes an amount that would read as zero as under the smallest amount", () => {
      expect(moneyAmount(0.0004)).toBe("under €0.001");
    });

    it("writes zero as zero", () => {
      expect(moneyAmount(0)).toBe("€0.00");
    });

    it("writes the workspace's currency", () => {
      expect(moneyAmount(2, "USD")).toBe("$2.00");
      expect(moneyAmount(0.0001, "USD")).toBe("under $0.001");
    });

    it("refuses a negative or non-finite amount", () => {
      expect(() => moneyAmount(-0.5)).toThrow(RangeError);
      expect(() => moneyAmount(Number.NaN)).toThrow(RangeError);
    });
  });
});
