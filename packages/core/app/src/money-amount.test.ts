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
      expect(moneyAmount(0.0094)).toBe("€0.009");
    });

    it("writes an amount that rounds to a cent as one cent, not €0.010", () => {
      expect(moneyAmount(0.0095)).toBe("€0.01");
      expect(moneyAmount(0.00999)).toBe("€0.01");
    });

    it("rounds a half at the last decimal up, as a person typed it", () => {
      expect(moneyAmount(0.0045)).toBe("€0.005");
      expect(moneyAmount(1.005)).toBe("€1.01");
    });

    it("separates thousands", () => {
      expect(moneyAmount(999.99)).toBe("€999.99");
      expect(moneyAmount(1234.5)).toBe("€1,234.50");
    });

    it("writes the smallest amounts either side of half a thousandth", () => {
      expect(moneyAmount(0.00049)).toBe("under €0.001");
      expect(moneyAmount(0.0005)).toBe("€0.001");
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
      expect(moneyAmount(0.0001, "USD", { tiny: "less than" })).toBe("less than $0.001");
    });

    it("refuses a negative or non-finite amount", () => {
      expect(() => moneyAmount(-0.5)).toThrow(RangeError);
      expect(() => moneyAmount(Number.NaN)).toThrow(RangeError);
    });
  });
});
