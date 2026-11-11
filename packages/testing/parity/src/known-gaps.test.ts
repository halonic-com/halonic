import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readRunLogs, testName } from "./compare/run-logs.ts";
import { knownGapsFile, parseKnownGaps, readKnownGaps } from "./known-gaps.ts";

const gap = {
  id: "json-output-stays-text",
  task: "HAL-1541",
  area: "workflow runs: an agent JSON output",
  old: "parsed",
  new: "text",
  tests: ["billing/batch/each line runs the line-check workflow"],
};

verifies("parity.known-gaps-checked", () => {
  it("reads a well-formed gap as it is", () => {
    expect(parseKnownGaps([gap])).toEqual([gap]);
  });

  it("refuses a gap without a task", () => {
    expect(() => parseKnownGaps([{ ...gap, task: "soon" }])).toThrow(
      /known gap 1: task "soon" must look like "HAL-123"/,
    );
  });

  it("refuses a gap that lists no test, or a test without its hub and workflow", () => {
    expect(() => parseKnownGaps([{ ...gap, tests: [] }])).toThrow(/"tests" must list tests/);
    expect(() => parseKnownGaps([{ ...gap, tests: ["approve"] }])).toThrow(
      /"tests" must list tests/,
    );
  });

  it("refuses an unknown field, an id that isn't kebab-case and an empty text", () => {
    expect(() => parseKnownGaps([{ ...gap, taks: "HAL-1" }])).toThrow(/unknown field "taks"/);
    expect(() => parseKnownGaps([{ ...gap, id: "Json" }])).toThrow(/must be kebab-case/);
    expect(() => parseKnownGaps([{ ...gap, old: " " }])).toThrow(/"old" must be a non-empty/);
  });

  it("refuses an id used twice, a gap that isn't an object and a file that isn't a list", () => {
    expect(() => parseKnownGaps([gap, gap])).toThrow(/known gap 2: id "json-output-stays-text"/);
    expect(() => parseKnownGaps(["gap"])).toThrow(/each gap must be an object/);
    expect(() => parseKnownGaps({ gaps: [] })).toThrow(/must hold a list/);
  });

  it("accepts the package's own file, whose gaps name only tests of the base", () => {
    const base = readRunLogs(join(import.meta.dirname, "..", "fixtures", "base"));
    const tests = new Set(base.tests.map(testName));
    for (const known of readKnownGaps(knownGapsFile)) {
      expect(
        known.tests.filter((test) => !tests.has(test)),
        known.id,
      ).toEqual([]);
    }
  });
});
