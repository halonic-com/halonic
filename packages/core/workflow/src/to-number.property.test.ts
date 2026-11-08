import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it } from "vitest";
import { toNumber } from "./to-number.ts";

// A fixed seed keeps the run the same every time (no flaky tests); a failure
// prints its own seed and path to replay it.
const SEED = 622;

/**
 * Writes an amount of cents as money text, with a thousands separator every
 * three digits and two decimals. Written by hand rather than with
 * `Intl.NumberFormat`, so the test does not depend on the runtime's locale data.
 */
function asMoney(cents: number, thousands: string, decimal: string): string {
  const whole = String(Math.floor(cents / 100));
  const fraction = String(cents % 100).padStart(2, "0");
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3) {
    groups.unshift(whole.slice(Math.max(0, end - 3), end));
  }
  return `${groups.join(thousands)}${decimal}${fraction}`;
}

verifies("workflow.to-number", () => {
  it("returns any finite number as it is", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (number) => {
        expect(toNumber(number)).toBe(number);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it("reads amounts written in English and European style alike", () => {
    const cents = fc.integer({ min: 0, max: 100_000_000_000 });
    const symbol = fc.constantFrom("", "€ ", "$", "EUR ", " ");
    fc.assert(
      fc.property(cents, symbol, (amount, prefix) => {
        const expected = amount / 100;
        expect(toNumber(`${prefix}${asMoney(amount, ",", ".")}`)).toBe(expected);
        expect(toNumber(`${prefix}${asMoney(amount, ".", ",")}`)).toBe(expected);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });
});
