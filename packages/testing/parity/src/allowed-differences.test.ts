import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAllowedDifferences, readAllowedDifferences } from "./allowed-differences.ts";

const file = fileURLToPath(new URL("../allowed-differences.json", import.meta.url));

const difference = {
  id: "memory-run-store-expected-seq",
  requirement: "contracts.run-store",
  area: "memory RunStore: append",
  old: "appended any event",
  new: "checks expectedSeq",
  why: "two writers never interleave",
  status: "proposed",
};

describe("parity.allowed-differences-checked", () => {
  it("reads a well-formed difference as it is", () => {
    expect(parseAllowedDifferences([difference])).toEqual([difference]);
  });

  it("refuses a difference without a requirement ID", () => {
    const { requirement: _, ...withoutRequirement } = difference;
    expect(() => parseAllowedDifferences([withoutRequirement])).toThrow(
      /allowed difference 1: "requirement" must be a non-empty string/,
    );
  });

  it("refuses a requirement ID without its package", () => {
    expect(() => parseAllowedDifferences([{ ...difference, requirement: "run-store" }])).toThrow(
      /requirement "run-store" must look like "package.name"/,
    );
  });

  it("refuses an empty explanation", () => {
    expect(() => parseAllowedDifferences([{ ...difference, why: "  " }])).toThrow(
      /"why" must be a non-empty string/,
    );
  });

  it("refuses an unknown status and names the allowed ones", () => {
    expect(() => parseAllowedDifferences([{ ...difference, status: "approved" }])).toThrow(
      /unknown status "approved" \(one of proposed, signed-off\)/,
    );
  });

  it("refuses an unknown field, so a misspelt one isn't silently dropped", () => {
    expect(() => parseAllowedDifferences([{ ...difference, reqirement: "x.y" }])).toThrow(
      /unknown field "reqirement"/,
    );
  });

  it("refuses an id used twice and names the second entry", () => {
    expect(() => parseAllowedDifferences([difference, difference])).toThrow(
      /allowed difference 2: id "memory-run-store-expected-seq" is used twice/,
    );
  });

  it("refuses a file that isn't a list", () => {
    expect(() => parseAllowedDifferences({ differences: [] })).toThrow(/must hold a list/);
  });

  it("accepts the package's own file", () => {
    const differences = readAllowedDifferences(file);
    expect(differences.map((entry) => entry.requirement)).toEqual([
      "contracts.definition-source",
      "contracts.blob-store",
      "contracts.run-store",
    ]);
  });
});
