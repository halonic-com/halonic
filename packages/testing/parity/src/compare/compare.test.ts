import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { OldDiagnostic, OldIssue } from "../recording.ts";
import { compareFile, deepEqual, type NewProblem, type NewResult } from "./compare.ts";
import type { FileCheck } from "./file-checks.ts";

const flatPath = "agents/clerk.agent.yaml";

function check(
  issues: OldIssue[],
  diagnostics: OldDiagnostic[] = [],
  schema: string | null = "agent",
): FileCheck {
  const failed = issues.length > 0 || diagnostics.some((d) => d.severity === "error");
  return {
    name: `agent/x: ${flatPath}`,
    caseId: "agent/x",
    file: flatPath,
    kind: "agent",
    text: "",
    id: "clerk",
    recorded: {
      file: flatPath,
      flatPath,
      read: true,
      schema,
      issues,
      status: failed ? "fail" : "pass",
    },
    diagnostics,
  };
}

const problem = (overrides: Partial<NewProblem> = {}): NewProblem => ({
  severity: "error",
  source: "schema",
  code: "invalid_type",
  path: ["name"],
  line: 2,
  col: 7,
  ...overrides,
});

const failing = (...problems: NewProblem[]): NewResult => ({ ok: false, error: problems });
const passing: NewResult = { ok: true, value: { warnings: [] } };
const oldIssue: OldIssue = { path: ["name"], code: "invalid_type", message: "x", line: 2, col: 7 };

verifies("parity.compare-exact", () => {
  it("finds a file the same when path, code, line and column agree", () => {
    const result = compareFile(check([oldIssue]), failing(problem()));
    expect(result.same).toBe(true);
    expect(result.old).toEqual({
      status: "fail",
      problems: [{ path: ["name"], code: "invalid_type", line: 2, col: 7 }],
    });
  });

  it.each([
    ["line", { line: 3 }],
    ["column", { col: 8 }],
    ["code", { code: "invalid_enum_value" }],
    ["path", { path: ["description"] }],
    ["path index", { path: ["name", 0] }],
  ])("finds a file different when the %s differs", (_what, overrides) => {
    expect(compareFile(check([oldIssue]), failing(problem(overrides))).same).toBe(false);
  });

  it("finds a file different when the old issue had no line and the new one has", () => {
    const { line: _line, col: _col, ...withoutLine } = oldIssue;
    const result = compareFile(check([withoutLine]), failing(problem()));
    expect(result.old.problems[0]).toEqual({
      path: ["name"],
      code: "invalid_type",
      line: null,
      col: null,
    });
    expect(result.same).toBe(false);
  });

  it("finds a file different when pass and fail differ, or a problem is extra", () => {
    expect(compareFile(check([oldIssue]), passing).same).toBe(false);
    expect(compareFile(check([]), failing(problem())).same).toBe(false);
    expect(compareFile(check([oldIssue]), failing(problem(), problem())).same).toBe(false);
  });

  it("compares the problems in order", () => {
    const second: OldIssue = { ...oldIssue, path: ["model"] };
    const result = compareFile(
      check([oldIssue, second]),
      failing(problem({ path: ["model"] }), problem()),
    );
    expect(result.same).toBe(false);
  });

  it("leaves new warnings out, but fails a result that isn't ok", () => {
    const warned: NewResult = { ok: true, value: { warnings: [problem({ severity: "warning" })] } };
    expect(compareFile(check([]), warned).same).toBe(true);
    const onlyWarned = compareFile(check([]), failing(problem({ severity: "warning" })));
    expect(onlyWarned.new).toEqual({ status: "fail", problems: [] });
    expect(onlyWarned.same).toBe(false);
  });

  it("keeps the old loader's errors between files and still compares the file", () => {
    const unknownAgent: OldDiagnostic = {
      severity: "error",
      path: flatPath,
      message: 'Agent "clerk" delegates to unknown agent "ghost"',
    };
    const elsewhere: OldDiagnostic = { ...unknownAgent, path: "workspace.yaml" };
    const result = compareFile(check([], [unknownAgent, elsewhere]), passing);
    expect(result.same).toBe(true);
    expect(result.loaderErrors).toEqual([unknownAgent.message]);
    expect(compareFile(check([], [unknownAgent]), failing(problem())).same).toBe(false);
    expect(compareFile(check([oldIssue], [unknownAgent]), failing(problem())).loaderErrors).toEqual(
      [],
    );
  });

  it("compares a YAML error by its line and column, with the code syntax", () => {
    const yamlError: OldDiagnostic = {
      severity: "error",
      path: flatPath,
      message: "YAML: bad indentation",
      line: 4,
      col: 3,
    };
    const broken = check([], [yamlError], null);
    const syntax = problem({ source: "syntax", code: "BAD_INDENT", path: [], line: 4, col: 3 });
    expect(compareFile(broken, failing(syntax)).same).toBe(true);
    expect(compareFile(broken, failing({ ...syntax, line: 5 })).same).toBe(false);
    expect(compareFile(broken, failing({ ...syntax, source: "schema" })).same).toBe(false);
    const { line: _line, col: _col, ...withoutPosition } = yamlError;
    const noPosition = check([], [withoutPosition], null);
    expect(compareFile(noPosition, failing(syntax)).old.problems[0]).toMatchObject({
      line: null,
      col: null,
    });
  });

  it("refuses a recording with no schema and no YAML error", () => {
    expect(() => compareFile(check([], [], null), passing)).toThrow(/no YAML error/);
  });

  it("compares values key by key, whatever their order", () => {
    expect(deepEqual({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual(1, "1")).toBe(false);
  });
});
