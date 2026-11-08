// Acceptance: every file the old loader read in Julian's parity fixtures
// (packages/testing/parity), parsed on its own with parseFile, must give the
// recorded pass or fail, issue paths, codes, lines and columns. Checks that
// span files (unknown references, workflow rules, routine triggers) are the
// phase 2 loader's and are not compared here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type FileRecording,
  loadCases,
  type ParityCase,
  type Recording,
} from "@halonicjs/testing-parity";
import { describe, expect, it } from "vitest";
import { type FileProblem, isKindName, type KindName, parseFile } from "./index.ts";

const fixtures = join(import.meta.dirname, "..", "..", "..", "testing", "parity", "fixtures");

/** Where the new code means to differ from a recording, and the requirement that says why. */
const differences: Readonly<Record<string, string>> = {
  "routine/mail-every-15m": "format.routine-mail-interval",
  "skill/yaml-syntax": "format.skill-file",
  "deployments/unknown-default": "format.deployments-file",
};

interface FileCase {
  readonly name: string;
  readonly caseId: string;
  readonly kind: KindName;
  readonly text: string;
  readonly id: string | undefined;
  readonly recorded: FileRecording;
  readonly diagnostics: Recording["diagnostics"];
}

function textOf(parityCase: ParityCase, file: string): string {
  const own = parityCase.files.includes(file);
  const folder = own ? join(parityCase.folder, "files") : join(fixtures, "base", "files");
  return readFileSync(join(folder, file), "utf8");
}

/** The id the old loader gave a file from its place (784f78d: collect, the hub loop, collectSkills). */
function placeIdOf(kind: KindName, file: string): string | undefined {
  const parts = file.split("/");
  const name = parts.at(-1) ?? "";
  if (kind === "hub" || kind === "skill") {
    return parts.at(-2);
  }
  if (
    kind === "workspace" ||
    kind === "deployments" ||
    kind === "models" ||
    kind === "workflowTest"
  ) {
    return undefined;
  }
  return name.replace(/(\.(agent|workflow|flow|test|routine|connector))?\.ya?ml$/, "");
}

function fileCases(): FileCase[] {
  const found: FileCase[] = [];
  for (const parityCase of loadCases(fixtures)) {
    const recording = JSON.parse(
      readFileSync(join(parityCase.folder, "recorded.json"), "utf8"),
    ) as Recording;
    for (const recorded of recording.files) {
      const kind = recorded.schema ?? parityCase.kind;
      if (!recorded.read || !isKindName(kind)) {
        continue;
      }
      found.push({
        name: `${parityCase.id}: ${recorded.file}`,
        caseId: parityCase.id,
        kind,
        text: textOf(parityCase, recorded.file),
        id: placeIdOf(kind, recorded.file),
        recorded,
        diagnostics: recording.diagnostics,
      });
    }
  }
  return found;
}

function parse(file: FileCase) {
  return parseFile(file.kind, file.text, file.id === undefined ? {} : { id: file.id });
}

/** Path, code and position of each schema problem; skills had no line before, so theirs leave it out. */
function shapeOf(
  problem: { path: readonly (string | number)[]; code: string; line?: number; col?: number },
  kind: KindName,
) {
  const shape = { path: problem.path, code: problem.code };
  return kind === "skill" ? shape : { ...shape, line: problem.line, col: problem.col };
}

const files = fileCases();
const compared = files.filter((file) => differences[file.caseId] === undefined);

describe("format.parity-fixtures", () => {
  it("covers every kind in the fixtures", () => {
    expect(new Set(files.map((file) => file.kind)).size).toBe(14);
    expect(files.length).toBeGreaterThan(150);
  });

  it.each(compared)("matches the recording for $name", (file) => {
    const parsed = parse(file);
    const { recorded } = file;
    if (recorded.schema === null) {
      const yamlError = file.diagnostics.find(
        (diagnostic) =>
          diagnostic.path === recorded.flatPath && diagnostic.message.startsWith("YAML:"),
      );
      expect(parsed.ok).toBe(false);
      const problems: FileProblem[] = parsed.ok ? [] : parsed.error;
      expect(problems.map((problem) => [problem.source, problem.line, problem.col])).toEqual([
        ["syntax", yamlError?.line, yamlError?.col],
      ]);
      return;
    }
    if (recorded.issues.length === 0) {
      expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
      return;
    }
    expect(parsed.ok).toBe(false);
    const problems = parsed.ok ? [] : parsed.error;
    expect(problems.map((problem) => shapeOf(problem, file.kind))).toEqual(
      recorded.issues.map((issue) => shapeOf(issue, file.kind)),
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

describe("format.parity-fixtures: the listed differences", () => {
  it("lists only cases that exist", () => {
    for (const caseId of Object.keys(differences)) {
      expect(
        files.some((file) => file.caseId === caseId),
        caseId,
      ).toBe(true);
    }
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
