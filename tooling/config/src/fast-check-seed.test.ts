import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { defaultFastCheckSeed, fastCheckSeed, usesFastCheck } from "./fast-check-seed.ts";

describe("fastCheckSeed", () => {
  it("uses the fixed seed when FAST_CHECK_SEED isn't set", () => {
    expect(fastCheckSeed(undefined)).toBe(defaultFastCheckSeed);
    expect(fastCheckSeed("")).toBe(defaultFastCheckSeed);
  });

  it("takes another whole number as the seed", () => {
    expect(fastCheckSeed("42")).toBe(42);
    expect(fastCheckSeed("-1730402")).toBe(-1730402);
  });

  it("leaves the seed to fast-check for random", () => {
    expect(fastCheckSeed("random")).toBeUndefined();
  });

  it("refuses anything else", () => {
    for (const value of ["1.5", "abc", " 42", "99999999999999999999", "Random"]) {
      expect(() => fastCheckSeed(value)).toThrow("FAST_CHECK_SEED");
    }
  });
});

describe("usesFastCheck", () => {
  let directory: string | undefined;
  afterEach(() => {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function packageWith(manifest: object): string {
    directory = mkdtempSync(join(tmpdir(), "fast-check-seed-"));
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    return directory;
  }

  it("is true when the package lists fast-check", () => {
    expect(usesFastCheck(packageWith({ devDependencies: { "fast-check": "catalog:" } }))).toBe(
      true,
    );
    expect(usesFastCheck(packageWith({ dependencies: { "fast-check": "^4.0.0" } }))).toBe(true);
  });

  it("is false otherwise", () => {
    expect(usesFastCheck(packageWith({ devDependencies: { vitest: "catalog:" } }))).toBe(false);
    expect(usesFastCheck(packageWith({}))).toBe(false);
    directory = mkdtempSync(join(tmpdir(), "fast-check-seed-"));
    expect(usesFastCheck(directory)).toBe(false);
  });
});

describe("the fast-check setup file", () => {
  it("has set the seed for this run", () => {
    expect(fc.readConfigureGlobal().seed).toBe(fastCheckSeed(process.env["FAST_CHECK_SEED"]));
  });

  it("makes a property with expect calls behind conditions make the same number each run", () => {
    // Like the yaml property tests: fc.pre drops some inputs and only some
    // inputs reach an expect. With a random seed the count differs per run.
    // Under FAST_CHECK_SEED=random this test still uses the fixed seed.
    const seed = fc.readConfigureGlobal().seed ?? defaultFastCheckSeed;
    function countExpects(): number {
      let count = 0;
      fc.assert(
        fc.property(fc.integer(), fc.string(), (number, text) => {
          fc.pre(number % 3 !== 0);
          if (number > 0) {
            count += 1;
            expect(number).toBeGreaterThan(0);
          }
          for (const _ of text) {
            count += 1;
            expect(text.length).toBeGreaterThan(0);
          }
        }),
        { seed },
      );
      return count;
    }
    expect(countExpects()).toBe(countExpects());
  });
});
