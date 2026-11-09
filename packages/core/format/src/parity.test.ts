// Acceptance: every file the old loader read in Julian's parity fixtures
// (packages/testing/parity), parsed on its own with parseFile, must give the
// recorded pass or fail, issue paths, codes, lines and columns. The compare
// and the allowed differences live in testing-parity (plan 9.3 point 7);
// this file only feeds it parseFile. Checks that span files (unknown
// references, workflow rules, routine triggers) are the phase 2 loader's.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseWith } from "@halonicjs/schema-kit";
import {
  allowedDifferencesFile,
  compareFile,
  type FileCheck,
  fileChecks,
  judge,
  readAllowedDifferences,
} from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fileKinds, isKindName, type KindName, parseFile } from "./index.ts";
import { prepare } from "./parse-file.ts";
import { readSource } from "./source.ts";
import { fileSchemas as oldSchemas } from "./test/old-schemas.zod.ts";

const fixtures = join(import.meta.dirname, "..", "..", "..", "testing", "parity", "fixtures");

interface FileCase extends FileCheck {
  readonly kind: KindName;
}

function fileCases(): FileCase[] {
  return fileChecks(fixtures).map((check) => {
    const kind = check.kind;
    if (!isKindName(kind)) {
      throw new Error(`${check.name}: no file kind "${kind}"`);
    }
    return { ...check, kind };
  });
}

function parse(file: FileCase) {
  return parseFile(file.kind, file.text, file.id === undefined ? {} : { id: file.id });
}

const files = fileCases();
const entries = readAllowedDifferences(allowedDifferencesFile);
const report = judge(
  files.map((file) => compareFile(file, parse(file))),
  entries,
);
/** The cases an allowed difference names: the new code means to differ there. */
const differing = new Set(
  entries.flatMap((entry) => (entry.fixtures ?? []).map((fixture) => fixture.case)),
);
const compared = files.filter((file) => !differing.has(file.caseId));

// The old app had no integration sheet and no plugin manifest, so there is
// nothing to compare them with.
type ComparedKind = Exclude<KindName, "skill" | "integration" | "plugin">;

/** The data a file's kind schema gets: its YAML with old keys upgraded and the id from its place. */
function dataOf(file: FileCase, kind: ComparedKind): unknown {
  const read = readSource(fileKinds[kind].syntax, file.text);
  if (!read.ok) {
    throw new Error(`${file.name}: ${read.error.message}`);
  }
  return prepare(fileKinds[kind], read.value.data, file.id).data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every key path in the data, maps inside lists included: the keys a variant can leave out. */
function keyPaths(value: unknown, path: readonly (string | number)[] = []): (string | number)[][] {
  let children: [string | number, unknown][] = [];
  if (Array.isArray(value)) {
    children = value.map((item, index) => [index, item]);
  } else if (isRecord(value)) {
    children = Object.entries(value);
  }
  return children.flatMap(([key, child]) => [
    ...(typeof key === "string" ? [[...path, key]] : []),
    ...keyPaths(child, [...path, key]),
  ]);
}

/** A copy of the data without the key at the path. */
function without(value: unknown, path: readonly (string | number)[]): unknown {
  const [head, ...rest] = path;
  if (head === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => (index === head ? without(item, rest) : item));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (rest.length === 0) {
    const { [head]: _left, ...kept } = value;
    return kept;
  }
  return { ...value, [head]: without(value[head], rest) };
}

/** Files the old app read without a problem. Skills are left out: their shape changed on purpose (format.skill-file). */
const passing = compared.filter(
  (file) =>
    file.kind !== "skill" && file.recorded.schema !== null && file.recorded.issues.length === 0,
);

verifies("format.parity-fixtures", () => {
  it("covers every kind in the fixtures", () => {
    expect(new Set(files.map((file) => file.kind)).size).toBe(14);
    expect(files.length).toBeGreaterThan(150);
  });

  it("has no difference that isn't allowed, and no stale allowed difference", () => {
    expect(report.unexplained.map((result) => [result.name, result.old, result.new])).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it.each(report.results)("matches the recording for $name", (result) => {
    expect(result.verdict, JSON.stringify({ old: result.old, new: result.new })).not.toBe(
      "different",
    );
  });

  it("warns where the old loader warned about a connector", () => {
    const file = files.find(
      (candidate) =>
        candidate.caseId === "connector/approve-not-allowed" &&
        candidate.kind === "connector" &&
        candidate.diagnostics.some(
          (d) => d.severity === "warning" && d.path === candidate.recorded.flatPath,
        ),
    );
    expect(file).toBeDefined();
    const parsed = file === undefined ? undefined : parse(file);
    expect(parsed?.ok && parsed.value.warnings.map((warning) => warning.code)).toEqual([
      "approved-tool-not-allowed",
    ]);
  });

  it("puts a missing required key on the line of its parent key, as the fixtures expect", () => {
    const root = join(fixtures, "cases");
    const checked: string[] = [];
    for (const kind of readdirSync(root).sort()) {
      const caseFile = join(root, kind, "missing-required", "case.json");
      if (!existsSync(caseFile)) continue;
      const expected = (
        JSON.parse(readFileSync(caseFile, "utf8")) as {
          expect: { file: string; path: string; line: number } | null;
        }
      ).expect;
      const caseId = `${kind}/missing-required`;
      const file = files.find(
        (candidate) => candidate.caseId === caseId && candidate.file === expected?.file,
      );
      const parsed = file === undefined ? undefined : parse(file);
      const problems = parsed === undefined || parsed.ok ? [] : parsed.error;
      const problem = problems.find((found) => found.path.join(".") === expected?.path);
      // A case whose problem sits on another path (a union reports its parent) is not about this rule.
      if (problem === undefined) continue;
      checked.push(caseId);
      expect({ id: caseId, line: problem.line }).toEqual({ id: caseId, line: expected?.line });
    }
    expect(checked).toEqual(
      expect.arrayContaining([
        "agent/missing-required",
        "deployments/missing-required",
        "models/missing-required",
      ]),
    );
  });

  it("gives every failing fixture file a path and a line", () => {
    for (const file of files) {
      const parsed = parse(file);
      for (const problem of parsed.ok ? parsed.value.warnings : parsed.error) {
        expect(Array.isArray(problem.path)).toBe(true);
        expect(problem.line).toBeGreaterThanOrEqual(1);
        expect(problem.col).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

verifies("format.parity-defaults", () => {
  it("compares a passing file of every kind but skill", () => {
    expect(new Set(passing.map((file) => file.kind)).size).toBe(13);
  });

  it.each(passing)("gives the old app's value for $name", (file) => {
    const kind = file.kind as ComparedKind;
    const parsed = parse(file);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    expect(parsed.ok && parsed.value.value).toEqual(oldSchemas[kind].parse(dataOf(file, kind)));
  });

  // The fixtures spell out most fields, so leave one key out at a time: where
  // the old schema still passes, its default must be the new kind's.
  it.each(passing)("fills in the old app's defaults for $name", (file) => {
    const kind = file.kind as ComparedKind;
    const data = dataOf(file, kind);
    const ours: { without: string; value: unknown }[] = [];
    const theirs: { without: string; value: unknown }[] = [];
    for (const path of keyPaths(data)) {
      const variant = without(data, path);
      const old = oldSchemas[kind].safeParse(variant);
      if (old.success) {
        const parsed = parseWith(fileKinds[kind].schema, variant);
        ours.push({ without: path.join("."), value: parsed.ok ? parsed.value : parsed.error });
        theirs.push({ without: path.join("."), value: old.data });
      }
    }
    // Some files have only required keys, so the lists can be empty.
    expect(ours).toEqual(theirs);
  });
});

verifies("format.parity-fixtures", () => {
  it("allows the nine files the format entries name", () => {
    expect(report.results.filter((result) => result.verdict === "allowed").length).toBe(9);
  });

  it("passes a mail interval of 15m, which the old code refused (format.routine-mail-interval)", () => {
    const file = files.find(
      (candidate) =>
        candidate.caseId === "routine/mail-every-15m" &&
        candidate.kind === "routine" &&
        candidate.recorded.issues.length > 0,
    );
    expect(file?.recorded.status).toBe("fail");
    expect(file === undefined ? false : parse(file).ok).toBe(true);
  });

  it("reports broken skill front matter as YAML at its line (format.skill-file)", () => {
    const file = files.find(
      (candidate) =>
        candidate.caseId === "skill/yaml-syntax" && candidate.recorded.status === "fail",
    );
    const parsed = file === undefined ? undefined : parse(file);
    expect(parsed?.ok).toBe(false);
    expect(
      parsed?.ok === false && parsed.error.map((problem) => [problem.source, problem.line]),
    ).toEqual([["syntax", 3]]);
  });

  it("refuses an unlisted default deployment in the file, at its line (format.deployments-file)", () => {
    const file = files.find(
      (candidate) =>
        candidate.caseId === "deployments/unknown-default" && candidate.kind === "deployments",
    );
    const parsed = file === undefined ? undefined : parse(file);
    expect(
      parsed?.ok === false && parsed.error.map((problem) => [problem.code, problem.path]),
    ).toEqual([["default-deployment-not-listed", ["default"]]]);
  });
});
