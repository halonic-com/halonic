import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it } from "vitest";
import { parseDuration } from "./parse-duration.ts";

// A fixed seed keeps the run the same every time (no flaky tests); a failure
// prints its own seed and path to replay it.
const SEED = 622;

// Written out by hand rather than taken from the code under test, so a wrong
// unit length there can't hide here.
const UNIT_LENGTHS = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

const unit = fc.constantFrom("m", "h", "d") as fc.Arbitrary<keyof typeof UNIT_LENGTHS>;
const count = fc.integer({ min: 1, max: 1_000_000 });

/**
 * Whether the text is exactly a count of 1 or more without leading zeros
 * followed by one unit letter. Checked character by character, not with the
 * pattern the code uses.
 */
function isDuration(text: string): boolean {
  const digits = text.slice(0, -1);
  const last = text.slice(-1);
  return (
    digits.length > 0 &&
    digits[0] !== "0" &&
    [...digits].every((char) => char >= "0" && char <= "9") &&
    ["m", "h", "d"].includes(last)
  );
}

/** Text near the pattern: a count, a unit, signs, dots and spaces in any order. */
const nearDuration = fc
  .array(fc.constantFrom("0", "1", "5", "9", "m", "h", "d", "s", "M", " ", ".", "-", "+", "\n"), {
    maxLength: 6,
  })
  .map((chars) => chars.join(""));

verifies("workflow.parse-duration", () => {
  it("is the count times the unit's length, for every count and unit", () => {
    fc.assert(
      fc.property(count, unit, (n, u) => {
        expect(parseDuration(`${n}${u}`)).toBe(n * UNIT_LENGTHS[u]);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });
});

verifies("workflow.parse-duration-rejects-bad-durations", () => {
  it("throws for any text outside the pattern", () => {
    const anyText = fc.oneof(nearDuration, fc.string({ maxLength: 8 }));
    fc.assert(
      fc.property(
        anyText.filter((text) => !isDuration(text)),
        (text) => {
          expect(() => parseDuration(text)).toThrow(`Bad duration "${text}"`);
        },
      ),
      { seed: SEED, numRuns: 300 },
    );
  });
});
