import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { toNumber } from "./to-number.ts";

verifies("workflow.to-number", () => {
  // Ported from "number guards" › "reads European and English number styles"
  // at 784f78d. The empty text and null cases of that line are under
  // workflow.to-number-not-a-number below.
  it("reads European and English number styles", () => {
    expect([
      toNumber("1.200,50"),
      toNumber("1,200.50"),
      toNumber("€ 18.400"),
      toNumber("12"),
    ]).toEqual([1200.5, 1200.5, 18400, 12]);
  });

  it("drops money symbols, codes and spaces", () => {
    expect(toNumber("EUR 1.250,00")).toBe(1250);
    expect(toNumber("$1,000.00")).toBe(1000);
    expect(toNumber(" 42 ")).toBe(42);
  });

  it("returns finite numbers as they are", () => {
    expect(toNumber(999.5)).toBe(999.5);
    expect(toNumber(-3)).toBe(-3);
  });

  it("reads one or two digits after the last separator as decimals", () => {
    expect(toNumber("1,5")).toBe(1.5);
    expect(toNumber(".5")).toBe(0.5);
    expect(toNumber("1.2.3,45")).toBe(123.45);
  });

  // Old behaviour, kept as it is: three digits after the last separator make
  // it a thousands separator, even when only one separator is written.
  it("reads three digits after the last separator as thousands", () => {
    expect(toNumber("1.234.567")).toBe(1_234_567);
    expect(toNumber("1,234")).toBe(1234);
    expect(toNumber("1.234")).toBe(1234);
  });

  it("reads three digits after a separator as a decimal when the whole part is empty or zero", () => {
    expect(toNumber("0.125")).toBe(0.125);
    expect(toNumber("0.001")).toBe(0.001);
    expect(toNumber(".125")).toBe(0.125);
    expect(toNumber("-0,500")).toBe(-0.5);
  });

  it("reads four or more digits after the last separator as decimals", () => {
    expect(toNumber("3.14159")).toBe(3.14159);
    expect(toNumber("1.234,5678")).toBe(1234.5678);
  });

  it("keeps a leading minus sign", () => {
    expect(toNumber("-5")).toBe(-5);
    expect(toNumber("€-12,50")).toBe(-12.5);
  });

  // Old behaviour, kept as it is: letters are dropped before reading, so
  // digits on both sides of them join up.
  it("joins digits around dropped letters", () => {
    expect(toNumber("1e5")).toBe(15);
    expect(toNumber("12abc3")).toBe(123);
  });
});

verifies("workflow.to-number-not-a-number", () => {
  // Ported from the same line at 784f78d: toNumber("") and toNumber(null).
  it("gives null for empty text and null", () => {
    expect(toNumber("")).toBeNull();
    expect(toNumber(null)).toBeNull();
  });

  it("gives null for text without a digit", () => {
    expect(toNumber("n/a")).toBeNull();
    expect(toNumber("-")).toBeNull();
    expect(toNumber("Infinity")).toBeNull();
  });

  it("gives null when the minus sign is not in front", () => {
    expect(toNumber("5-")).toBeNull();
    expect(toNumber("1-2")).toBeNull();
    expect(toNumber("--1")).toBeNull();
  });

  it("gives null for values that are neither numbers nor text", () => {
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(true)).toBeNull();
    expect(toNumber({ amount: 5 })).toBeNull();
  });

  it("gives null for numbers that are not finite", () => {
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
  });
});
