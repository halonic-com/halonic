import type { ParityCase } from "./cases.ts";

/** The commit of the old repo every recording comes from. */
export const referenceCommit = "784f78d";

/** A loader message, as the old `loadWorkspace` reports it. */
export interface OldDiagnostic {
  readonly severity: "error" | "warning" | "info";
  /** The file, as the loader names it: the flat path, not always the path on disk. */
  readonly path: string;
  readonly message: string;
  readonly state?: string;
  readonly line?: number;
  readonly col?: number;
}

/** One schema issue in one file, with the key path the schema gave it. */
export interface OldIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
}

/** What the old runner saw for one file of the workspace. */
export interface OldFile {
  /** Path on disk, relative to the workspace root. */
  readonly file: string;
  /** The path the old loader uses for it (folder layouts mapped away). */
  readonly flatPath: string;
  /** Whether the old loader read the file at all (it skips files outside its folders). */
  readonly read: boolean;
  /** The file kind whose schema checked it, or null when no schema ran (not read, or bad YAML). */
  readonly schema: string | null;
  readonly issues: readonly OldIssue[];
}

/** What the old runner reports for one composed workspace. */
export interface OldResult {
  readonly id: string;
  readonly diagnostics: readonly OldDiagnostic[];
  readonly files: readonly OldFile[];
  readonly validate: {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  };
}

export type FileStatus = "pass" | "fail" | "not-read";

/** Whether the old code puts the error on the line the fixture says it is on. */
export type LineVerdict = "same" | "different" | "no-line" | "no-error";

export interface FileRecording extends OldFile {
  readonly status: FileStatus;
}

/** The golden file for one case: recorded.json. */
export interface Recording {
  readonly reference: string;
  readonly case: string;
  readonly valid: boolean;
  readonly files: readonly FileRecording[];
  readonly diagnostics: readonly OldDiagnostic[];
  readonly validate: OldResult["validate"];
  readonly line: {
    readonly expected: number | null;
    readonly recorded: number | null;
    readonly verdict: LineVerdict;
  } | null;
}

const clockOrId = [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, /\b(?:run|test)_[a-z0-9]{6,}/];

/**
 * Replaces the scratch folder with "<workspace>" so recordings don't depend on
 * where they were made, and refuses output that carries a time or a run ID:
 * those would need a fixed clock or fixed IDs first.
 */
export function normalise(value: string, workspaceDirs: readonly string[]): string {
  let out = value;
  for (const dir of workspaceDirs) {
    out = out.split(dir).join("<workspace>");
  }
  const found = clockOrId.find((pattern) => pattern.test(out));
  if (found !== undefined) {
    throw new Error(`Output carries a time or an ID (${found.source}); fix the clock or IDs first`);
  }
  return out;
}

function statusOf(file: OldFile, diagnostics: readonly OldDiagnostic[]): FileStatus {
  if (!file.read) {
    return "not-read";
  }
  const failed = diagnostics.some((d) => d.severity === "error" && d.path === file.flatPath);
  return failed || file.issues.length > 0 ? "fail" : "pass";
}

/**
 * Compares the fixture's hand-written line with the first error or warning
 * the old loader gave for that file.
 */
export function lineVerdict(parityCase: ParityCase, result: OldResult): Recording["line"] {
  const expected = parityCase.expect;
  if (expected === null) {
    return null;
  }
  const flatPath = result.files.find((f) => f.file === expected.file)?.flatPath ?? expected.file;
  const first = result.diagnostics.find((d) => d.severity !== "info" && d.path === flatPath);
  const recorded = first?.line ?? null;
  let verdict: LineVerdict = "same";
  if (first === undefined) {
    verdict = "no-error";
  } else if (recorded === null && expected.line !== null) {
    verdict = "no-line";
  } else if (recorded !== expected.line) {
    verdict = "different";
  }
  return { expected: expected.line, recorded, verdict };
}

/**
 * Turns the old runner's result into the golden recording. The base records
 * every file; a case records only its own files, since the rest is the base.
 */
export function toRecording(
  parityCase: ParityCase,
  result: OldResult,
  workspaceDirs: readonly string[],
): Recording {
  const clean = (text: string): string => normalise(text, workspaceDirs);
  const diagnostics = result.diagnostics.map((d) => ({ ...d, message: clean(d.message) }));
  const own = new Set(parityCase.files);
  const files = result.files
    .filter((f) => parityCase.id === "base" || own.has(f.file))
    .map((f) => ({ ...f, status: statusOf(f, diagnostics) }));
  return {
    reference: referenceCommit,
    case: parityCase.id,
    valid: !diagnostics.some((d) => d.severity === "error"),
    files,
    diagnostics,
    validate: {
      exitCode: result.validate.exitCode,
      stdout: clean(result.validate.stdout),
      stderr: clean(result.validate.stderr),
    },
    line: lineVerdict(parityCase, result),
  };
}

/** The golden file's text: two-space JSON with a final newline, keys in insertion order. */
export function goldenText(recording: Recording): string {
  return `${JSON.stringify(recording, null, 2)}\n`;
}
