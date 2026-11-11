import type { ParityCase } from "./cases.ts";
import { fixedTestTime } from "./old-repo.ts";

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

/** One run a workflow test started (the test's own run, or a nested workflow's), as the old run store kept it. */
export interface OldRun {
  readonly id: string;
  /** The old engine's run summary, as it is at the end of the test. */
  readonly summary: unknown;
  /** The run log: every event of the run, in order. */
  readonly events: readonly unknown[];
}

/** One workflow test case the old test runner ran, with fixed IDs and a fixed clock. */
export interface OldTestRun {
  readonly hub: string;
  readonly workflow: string;
  readonly name: string;
  readonly passed: boolean;
  readonly failures: readonly string[];
  /** The test's own run, or null when it never started. */
  readonly runId: string | null;
  /** Every run the test started, in the order the old IDs count up. */
  readonly runs: readonly OldRun[];
}

/** One call of the old CLI, as it ran on a fresh copy of the workspace. */
export interface OldCliRun {
  readonly name: string;
  /** The arguments, with `<workspace>` for the workspace folder. */
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Every run the call stored, by ID, each with all its events in order. */
  readonly runs: readonly { readonly id: string; readonly events: readonly unknown[] }[];
  /** Every file the call wrote under `.studio`, relative to it. */
  readonly stored: readonly string[];
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
  /** The workspace's workflow tests, only for a job that asked for them. */
  readonly tests?: readonly OldTestRun[];
  /** The old CLI calls, only for a job that asked for them. */
  readonly cli?: readonly OldCliRun[];
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
 * where they were made (and on which system: Windows line endings become
 * "\n"), and refuses output that carries a time or a run ID:
 * those would need a fixed clock or fixed IDs first.
 */
export function normalise(value: string, workspaceDirs: readonly string[]): string {
  let out = value.replaceAll("\r\n", "\n");
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

/** An old run ID: `<prefix>_<time in base 36>_<4 random bytes in hex>`. */
const randomId = /\b(?:run|test)_[a-z0-9]{6,}_[0-9a-f]{8}\b/;

/** The golden file of the old CLI calls on a case: cli.json. */
export interface CliRecording {
  readonly reference: string;
  readonly case: string;
  /** The time the old clock stood at; nothing in the CLI moves it. */
  readonly clock: string;
  readonly calls: readonly OldCliRun[];
}

/** How far from the fixed clock a recorded time may be: the base's longest timer is 2 days. */
const clockReach = 30 * 24 * 60 * 60 * 1000;

/**
 * Renames the IDs the old CLI made from the fixed clock and counting random
 * source (`run_mjuohs00_00000002`) to `run_1`, `run_2`, ... in the order the
 * counter made them, counted per prefix. Each call is its own process, so
 * each call counts from 1.
 */
function renameIds(call: OldCliRun): OldCliRun {
  const time = Date.parse(fixedTestTime).toString(36);
  const made = new RegExp(`\\b[a-z]+_${time}_[0-9a-f]{8}\\b`, "g");
  const text = JSON.stringify(call);
  const found = [...new Set([...text.matchAll(made)].map((match) => match[0]))].sort(
    (a, b) => Number.parseInt(a.slice(-8), 16) - Number.parseInt(b.slice(-8), 16),
  );
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const id of found) {
    const prefix = id.slice(0, id.indexOf("_"));
    const n = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, n);
    names.set(id, `${prefix}_${n}`);
  }
  const renamed = JSON.parse(text.replace(made, (id) => names.get(id) ?? id)) as OldCliRun;
  const runs = [...renamed.runs].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return { ...renamed, runs };
}

/**
 * Turns the old CLI calls into the golden file, with the IDs renamed. A
 * random old run ID, or a time more than 30 days from the fixed clock, means
 * the clock or IDs weren't fixed, so it is refused.
 */
export function toCliRecording(parityCase: ParityCase, calls: readonly OldCliRun[]): CliRecording {
  const renamed = calls.map(renameIds);
  const text = JSON.stringify(renamed);
  if (randomId.test(text)) {
    throw new Error("The old CLI's output carries a random run ID; fix the IDs first");
  }
  const fixed = Date.parse(fixedTestTime);
  const times = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) ?? [];
  const real = times.find((time) => Math.abs(Date.parse(time) - fixed) > clockReach);
  if (real !== undefined) {
    throw new Error(
      `The old CLI's output carries ${real}, not the fixed clock; fix the clock first`,
    );
  }
  return { reference: referenceCommit, case: parityCase.id, clock: fixedTestTime, calls: renamed };
}

/** The golden run logs of a case's workflow tests: run-logs.json. */
export interface RunLogs {
  readonly reference: string;
  readonly case: string;
  /** The time the old clock stood at; it moves only when a test says `advance`. */
  readonly clock: string;
  readonly tests: readonly OldTestRun[];
}

/**
 * Turns the old runner's workflow tests into the golden run logs, with the
 * scratch folder replaced. Unlike validate output, run logs carry times and
 * run IDs, but from a fixed clock and fixed IDs; a random old run ID means
 * the IDs weren't fixed, so it is refused.
 */
export function toRunLogs(
  parityCase: ParityCase,
  tests: readonly OldTestRun[],
  workspaceDirs: readonly string[],
): RunLogs {
  let text = JSON.stringify(tests);
  for (const dir of workspaceDirs) {
    text = text.split(JSON.stringify(dir).slice(1, -1)).join("<workspace>");
  }
  if (randomId.test(text)) {
    throw new Error("A run log carries a random run ID; fix the IDs first");
  }
  return {
    reference: referenceCommit,
    case: parityCase.id,
    clock: fixedTestTime,
    tests: JSON.parse(text) as OldTestRun[],
  };
}

/** The golden file's text: two-space JSON with a final newline, keys in insertion order. */
export function goldenText(golden: Recording | RunLogs | CliRecording): string {
  return `${JSON.stringify(golden, null, 2)}\n`;
}
