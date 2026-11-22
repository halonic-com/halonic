import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { median, robustFit, solve } from "./robust-fit.ts";

describe("median", () => {
  test("is the middle value, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});

describe("solve", () => {
  test("solves a small system, swapping rows when the first pivot is 0", () => {
    const solution = solve(
      [
        [0, 1],
        [2, 0],
      ],
      [3, 4],
    );
    expect(solution).toEqual([2, 3]);
  });

  test("returns nothing for a singular system", () => {
    expect(
      solve(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeUndefined();
  });
});

verifies("paperclip.seats-robust-fit", () => {
  describe("robustFit", () => {
    const truth = [0.5, 0.05, 4];
    // Made-up steps: millions of input, cached and output tokens, and the exact points they cost.
    const exact = Array.from({ length: 40 }, (_, n) => {
      const x = [1 + (n % 5), 10 + ((n * 7) % 13), 0.2 + ((n * 3) % 4) / 10];
      return { x, y: x.reduce((sum, value, index) => sum + value * (truth[index] ?? 0), 0) };
    });

    test("recovers exact coefficients from clean data", () => {
      const fit = robustFit(exact, 3);
      fit.coefficients.forEach((value, index) => {
        expect(value).toBeCloseTo(truth[index] ?? 0, 6);
      });
      expect(fit.medianAbsResidual).toBeCloseTo(0, 6);
      expect(fit.rSquared).toBeCloseTo(1, 6);
    });

    test("stays close to the true rate when every tenth step is wild", () => {
      const wild = exact.map((o, n) => (n % 10 === 0 ? { ...o, y: o.y + 40 } : o));
      const fit = robustFit(wild, 3);
      expect(fit.coefficients[2]).toBeGreaterThan(3.6);
      expect(fit.coefficients[2]).toBeLessThan(4.4);
      expect(fit.medianAbsResidual).toBeLessThan(0.5);
    });

    test("holds a coefficient at 0 rather than let it go negative", () => {
      const data = exact.map((o) => ({ x: o.x, y: 4 * (o.x[2] ?? 0) - 0.01 * (o.x[1] ?? 0) }));
      const fit = robustFit(data, 3);
      expect(fit.coefficients.every((value) => value >= 0)).toBe(true);
      expect(fit.coefficients[1]).toBe(0);
    });

    test("holds a token type with no data at 0", () => {
      const data = exact.map((o) => ({ x: [o.x[0] ?? 0, 0, o.x[2] ?? 0], y: 2 * (o.x[0] ?? 0) }));
      const fit = robustFit(data, 3);
      expect(fit.coefficients[0]).toBeCloseTo(2, 6);
      expect(fit.coefficients[1]).toBe(0);
    });

    test("gives zeros and no quality for no data", () => {
      const fit = robustFit([], 3);
      expect(fit.coefficients).toEqual([0, 0, 0]);
      expect(fit.medianAbsResidual).toBeNaN();
    });
  });
});
