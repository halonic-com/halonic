import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type AllowedDifference, parseAllowedDifferences } from "../allowed-differences.ts";
import type { AllowedFixture } from "./allowed-fixtures.ts";
import type { Comparison, Side } from "./compare.ts";
import { judge } from "./judge.ts";

const file = "library/skills/plain-words/SKILL.md";
const oldSide: Side = {
  status: "fail",
  problems: [{ path: ["name"], code: "invalid_type", line: null, col: null }],
};
const newSide: Side = {
  status: "fail",
  problems: [{ path: ["name"], code: "invalid_type", line: 2, col: 7 }],
};

function comparison(caseId: string, old: Side, fresh: Side): Comparison {
  const same = JSON.stringify(old) === JSON.stringify(fresh);
  const name = `${caseId}: ${file}`;
  return { name, caseId, file, kind: "skill", old, new: fresh, loaderErrors: [], same };
}

const fixture = (overrides: Partial<AllowedFixture> = {}): AllowedFixture => ({
  case: "skill/wrong-type",
  file,
  old: oldSide,
  new: newSide,
  ...overrides,
});

const entry = (overrides: Partial<AllowedDifference> = {}): AllowedDifference => ({
  id: "skill-lines",
  requirement: "format.skill-file",
  area: "skill files: lines",
  old: "no line",
  new: "a line",
  why: "an editor can point at it",
  status: "proposed",
  fixtures: [fixture()],
  ...overrides,
});

const different = comparison("skill/wrong-type", oldSide, newSide);

verifies("parity.allowed-fixture-differences", () => {
  it("allows a difference an entry writes out exactly, proposed or signed off", () => {
    for (const status of ["proposed", "signed-off"] as const) {
      const report = judge([different], [entry({ status })]);
      expect(report.results[0]).toMatchObject({ verdict: "allowed", entry: "skill-lines" });
      expect(report.unexplained).toEqual([]);
      expect(report.stale).toEqual([]);
    }
  });

  it("finds a difference no entry names, including one an entry without fixtures can't allow", () => {
    const other = comparison("skill/missing-description", oldSide, newSide);
    const { fixtures: _fixtures, ...withoutFixtures } = entry({ id: "no-fixtures" });
    const report = judge([different, other], [entry(), withoutFixtures]);
    expect(report.unexplained.map((r) => r.caseId)).toEqual(["skill/missing-description"]);
  });

  it("calls an entry stale when the new result moved, and allows nothing", () => {
    const moved: Side = {
      status: "fail",
      problems: [{ path: ["name"], code: "invalid_type", line: 3, col: 7 }],
    };
    const report = judge([comparison("skill/wrong-type", oldSide, moved)], [entry()]);
    expect(report.unexplained).toHaveLength(1);
    expect(report.stale).toEqual([
      expect.objectContaining({ entry: "skill-lines", reason: expect.stringMatching(/differ/) }),
    ]);
  });

  it("calls an entry stale when the old result it writes out isn't the recorded one", () => {
    const swapped = entry({ fixtures: [fixture({ old: newSide, new: oldSide })] });
    const report = judge([different], [swapped]);
    expect(report.stale).toHaveLength(1);
    expect(report.unexplained).toHaveLength(1);
  });

  it("calls an entry stale when old and new are the same now, or the file doesn't exist", () => {
    const same = comparison("skill/wrong-type", newSide, newSide);
    expect(judge([same], [entry()]).stale[0]?.reason).toMatch(/same now/);
    expect(judge([same], [entry()]).results[0]?.verdict).toBe("same");
    expect(judge([], [entry()]).stale[0]?.reason).toMatch(/no such fixture/);
  });

  it("reads an entry's fixtures", () => {
    expect(parseAllowedDifferences([entry()])).toEqual([entry()]);
  });

  const withNew = (side: unknown) => [entry({ fixtures: [fixture({ new: side as Side })] })];

  it.each([
    ["an empty fixtures list", [entry({ fixtures: [] })], /at least one fixture file/],
    ["fixtures that aren't a list", [{ ...entry(), fixtures: {} }], /at least one fixture file/],
    ["a fixture that isn't an object", [{ ...entry(), fixtures: [1] }], /must be an object/],
    ["a fixture without a case", [entry({ fixtures: [fixture({ case: "" })] })], /"case"/],
    ["a status that isn't pass or fail", withNew({ status: "ok", problems: [] }), /"pass" or/],
    ["problems that aren't a list", withNew({ status: "fail" }), /"problems" must be a list/],
    [
      "a line of 0",
      withNew({ status: "fail", problems: [{ path: [], code: "x", line: 0, col: 1 }] }),
      /"line" must be a number/,
    ],
    [
      "a path with an object",
      withNew({ status: "fail", problems: [{ path: [{}], code: "x", line: 1, col: 1 }] }),
      /keys and indexes/,
    ],
    [
      "the same fixture file in two entries",
      [entry(), entry({ id: "other" })],
      /fixture "skill\/wrong-type: .*" is listed twice/,
    ],
  ])("refuses %s", (_what, raw, message) => {
    expect(() => parseAllowedDifferences(raw)).toThrow(message);
  });
});
