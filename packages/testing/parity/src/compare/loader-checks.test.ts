import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type AllowedDifference, parseAllowedDifferences } from "../allowed-differences.ts";
import type { ParityCase } from "../cases.ts";
import type { FileRecording, OldDiagnostic, Recording } from "../recording.ts";
import type { AllowedCheck } from "./allowed-fixtures.ts";
import { judgeChecks } from "./judge.ts";
import {
  type CheckCase,
  type CheckMessage,
  type ChecksByFile,
  checkCases,
  checksByFile,
  compareChecks,
  oldChecks,
} from "./loader-checks.ts";

const clerk = "hubs/billing/agents/clerk.agent.yaml";
const routine = "hubs/billing/workflows/routines/month-end.routine.yaml";

function file(path: string, flatPath: string, failed = false): FileRecording {
  const issues = failed ? [{ path: ["name"], code: "invalid_type", message: "x", line: 1 }] : [];
  return { file: path, flatPath, read: true, schema: "agent", issues, status: "pass" };
}

function recording(files: FileRecording[], diagnostics: OldDiagnostic[]): Recording {
  return { files, diagnostics } as unknown as Recording;
}

const base = recording(
  [file(clerk, clerk), file(routine, "hubs/billing/routines/month-end.routine.yaml")],
  [],
);
const error = (message: string): CheckMessage => ({ severity: "error", message });

/** A fixture with the old side given, for compareChecks. */
function checkCase(id: string, old: ChecksByFile, leftOut: string[] = []): CheckCase {
  return { parityCase: { id } as ParityCase, old, leftOut: new Set(leftOut) };
}

verifies("parity.compare-loader-checks", () => {
  it("names a file by its path on disk, through the base's recording", () => {
    const own = recording(
      [],
      [{ severity: "error", path: "hubs/billing/routines/month-end.routine.yaml", message: "a" }],
    );
    expect(oldChecks(own, base).old).toEqual(new Map([[routine, [error("a")]]]));
  });

  it("keeps the old name of a folder and the order of each file's messages", () => {
    const own = recording(
      [],
      [
        { severity: "info", path: "projects", message: "old layout" },
        { severity: "error", path: clerk, message: "first" },
        { severity: "warning", path: clerk, message: "second" },
      ],
    );
    expect(oldChecks(own, base).old).toEqual(
      new Map([
        ["projects", [{ severity: "info", message: "old layout" }]],
        [clerk, [error("first"), { severity: "warning", message: "second" }]],
      ]),
    );
  });

  it("leaves out a file that failed on its own, as the case records it", () => {
    const diagnostics: OldDiagnostic[] = [
      { severity: "error", path: clerk, message: "own", line: 1 },
    ];
    const failed = oldChecks(recording([file(clerk, clerk, true)], diagnostics), base);
    expect(failed.old.size).toBe(0);
    expect(failed.leftOut).toEqual(new Set([clerk]));
    const brokenBase = recording([file(clerk, clerk, true)], []);
    const fixed = oldChecks(recording([file(clerk, clerk)], diagnostics), brokenBase);
    expect(fixed.old.size).toBe(1);
    expect(fixed.leftOut.size).toBe(0);
  });

  it("leaves out the files the old loader failed on both sides, and only those", () => {
    const fresh = checksByFile([
      { file: clerk, ...error("new loader's message") },
      { file: routine, ...error("new loader's message") },
    ]);
    const found = compareChecks(checkCase("agent/x", new Map(), [clerk]), fresh);
    expect(found.map((c) => [c.file, c.same])).toEqual([[routine, false]]);
  });

  it("compares file by file, in order, with a file only one side names", () => {
    const old = checksByFile([
      { file: clerk, ...error("a") },
      { file: clerk, ...error("b") },
    ]);
    const fresh = checksByFile([
      { file: routine, ...error("c") },
      { file: clerk, ...error("b") },
      { file: clerk, ...error("a") },
    ]);
    const found = compareChecks(checkCase("agent/x", old), fresh);
    expect(found.map((c) => [c.file, c.old.length, c.new.length, c.same])).toEqual([
      [clerk, 2, 2, false],
      [routine, 0, 1, false],
    ]);
  });

  // Reads every fixture's recording, which takes seconds on a slow disk.
  it("reads every fixture, the base first, with the old loader's messages", {
    timeout: 60_000,
  }, () => {
    const cases = checkCases(join(import.meta.dirname, "..", "..", "fixtures"));
    expect(cases[0]?.parityCase.id).toBe("base");
    expect(cases.find((c) => c.parityCase.id === "agent/unknown-model")?.old.size).toBe(1);
  });
});

const check = (overrides: Partial<AllowedCheck> = {}): AllowedCheck => ({
  case: "routine/bad-cron",
  file: routine,
  old: [error("old words")],
  new: [error("new words")],
  ...overrides,
});

const entry = (overrides: Partial<AllowedDifference> = {}): AllowedDifference => ({
  id: "routine-words",
  requirement: "routines.parse-cron",
  area: "routines: messages",
  old: "old words",
  new: "new words",
  why: "the routines package words them so",
  status: "proposed",
  checks: [check()],
  ...overrides,
});

verifies("parity.allowed-fixture-differences", () => {
  const compared = (fresh: CheckMessage[]) =>
    compareChecks(
      checkCase("routine/bad-cron", checksByFile([{ file: routine, ...error("old words") }])),
      checksByFile(fresh.map((message) => ({ file: routine, ...message }))),
    );

  it("allows a difference between files an entry writes out exactly", () => {
    const report = judgeChecks(compared([error("new words")]), [entry()]);
    expect(report.results[0]).toMatchObject({ verdict: "allowed", entry: "routine-words" });
    expect(report.stale).toEqual([]);
  });

  it("calls the entry stale when old and new are the same now", () => {
    const report = judgeChecks(compared([error("old words")]), [entry()]);
    expect(report.results[0]?.verdict).toBe("same");
    expect(report.stale[0]?.reason).toMatch(/same now/);
  });

  it("calls the entry stale when the new messages moved on", () => {
    const report = judgeChecks(compared([error("newer words")]), [entry()]);
    expect(report.unexplained).toHaveLength(1);
    expect(report.stale[0]?.reason).toMatch(/differ/);
  });

  it("reads an entry's checks and refuses a malformed one", () => {
    expect(parseAllowedDifferences([entry()])).toEqual([entry()]);
    const withOld = (old: unknown) => [{ ...entry(), checks: [{ ...check(), old }] }];
    expect(() => parseAllowedDifferences([{ ...entry(), checks: [] }])).toThrow(/at least one/);
    expect(() => parseAllowedDifferences(withOld({}))).toThrow(/"old" must be a list/);
    expect(() => parseAllowedDifferences(withOld([{ message: "x" }]))).toThrow(/"severity"/);
    expect(() => parseAllowedDifferences(withOld([{ severity: "error" }]))).toThrow(/"message"/);
    expect(() =>
      parseAllowedDifferences(withOld([{ severity: "error", message: "x", line: 3 }])),
    ).toThrow(/unknown field "line"/);
    expect(() =>
      parseAllowedDifferences([{ ...entry(), checks: [{ ...check(), messages: [] }] }]),
    ).toThrow(/unknown field "messages"/);
    expect(() => parseAllowedDifferences(withOld([{ severity: "fatal", message: "x" }]))).toThrow(
      /"severity"/,
    );
    expect(() => parseAllowedDifferences([entry(), entry({ id: "other" })])).toThrow(
      /checks: fixture "routine\/bad-cron: .*" is listed twice/,
    );
  });
});
