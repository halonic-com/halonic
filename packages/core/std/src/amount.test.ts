import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseAmount } from "./amount.ts";

verifies("std.amount", () => {
  it("reads a dot or a comma as the decimal separator", () => {
    expect(parseAmount("3.00")).toBe(3);
    expect(parseAmount("15,00")).toBe(15);
    expect(parseAmount("0,25")).toBe(0.25);
  });

  it("reads whole numbers and ignores surrounding spaces", () => {
    expect(parseAmount(" 7 ")).toBe(7);
    expect(parseAmount("0")).toBe(0);
  });

  it("treats a single separator as the decimal one", () => {
    expect(parseAmount("1,000")).toBe(1);
  });

  it("rejects grouping, signs, exponents, words and empty text", () => {
    for (const text of [
      "1.000,50",
      "1,000.50",
      "1.2.3",
      "-1",
      "+1",
      "1e3",
      "abc",
      "",
      "  ",
      "3.",
      ".5",
    ]) {
      expect(parseAmount(text), text).toBeUndefined();
    }
  });
});
