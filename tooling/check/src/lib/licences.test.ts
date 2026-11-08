import { describe, expect, test } from "vitest";
import {
  findCorrectionKeyProblems,
  findLicenceProblems,
  isAllowedExpression,
  type LicencePolicy,
} from "./licences.ts";

const allowed = new Set(["MIT", "Apache-2.0"]);

describe("isAllowedExpression", () => {
  test("accepts a listed ID and rejects others", () => {
    expect(isAllowedExpression("MIT", allowed)).toBe(true);
    expect(isAllowedExpression("GPL-3.0-only", allowed)).toBe(false);
  });

  test("one side of OR is enough, AND needs both", () => {
    expect(isAllowedExpression("MIT OR GPL-3.0-only", allowed)).toBe(true);
    expect(isAllowedExpression("MIT AND GPL-3.0-only", allowed)).toBe(false);
    expect(isAllowedExpression("(MIT OR GPL-3.0-only) AND Apache-2.0", allowed)).toBe(true);
  });

  test("judges WITH by its licence and rejects junk", () => {
    expect(isAllowedExpression("Apache-2.0 WITH LLVM-exception", allowed)).toBe(true);
    expect(isAllowedExpression("(MIT", allowed)).toBe(false);
    expect(isAllowedExpression("", allowed)).toBe(false);
    expect(isAllowedExpression("Unknown", allowed)).toBe(false);
  });
});

describe("findLicenceProblems", () => {
  const policy: LicencePolicy = {
    shipped: ["MIT"],
    devOnly: ["MPL-2.0"],
    corrections: { "fixed@1.0.0": "MIT", "@scope/fixed@2.0.0": "MIT" },
  };

  test("dev-only licences pass for tooling but not for shipped code", () => {
    const pkg = { name: "lightningcss", versions: ["1.0.0"], licence: "MPL-2.0" };
    expect(findLicenceProblems([pkg], policy, "dev")).toEqual([]);
    expect(findLicenceProblems([pkg], policy, "shipped")).toHaveLength(1);
  });

  test("a hand-checked correction replaces a wrong upstream licence field", () => {
    const pkg = { name: "fixed", versions: ["1.0.0"], licence: "SEE LICENSE IN LICENSE" };
    expect(findLicenceProblems([pkg], policy, "shipped")).toEqual([]);
    const scoped = { name: "@scope/fixed", versions: ["2.0.0"], licence: "UNKNOWN" };
    expect(findLicenceProblems([scoped], policy, "shipped")).toEqual([]);
  });

  test("a correction covers only the version that was checked", () => {
    const pkg = { name: "fixed", versions: ["1.0.0", "1.1.0"], licence: "SEE LICENSE IN LICENSE" };
    const problems = findLicenceProblems([pkg], policy, "shipped");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^fixed@1\.1\.0 is licensed/);
  });
});

describe("findCorrectionKeyProblems", () => {
  test("every correction names an exact version", () => {
    const corrections = { "a@1.0.0": "MIT", "@s/b@2.0.0": "MIT", c: "MIT", "@s/d": "MIT" };
    const problems = findCorrectionKeyProblems({ shipped: [], devOnly: [], corrections });
    expect(problems.map((problem) => problem.match(/"([^"]+)"/)?.[1])).toEqual(["c", "@s/d"]);
  });
});
