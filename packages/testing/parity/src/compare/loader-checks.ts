import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCases, type ParityCase } from "../cases.ts";
import type { FileRecording, OldDiagnostic, Recording } from "../recording.ts";
import { deepEqual } from "./compare.ts";

/** A message a loader gave about a file from a check between files, as both sides are compared. */
export interface CheckMessage {
  readonly severity: OldDiagnostic["severity"];
  readonly message: string;
}

/** A loader's messages from checks between files, by file on disk, each file's in the loader's order. */
export type ChecksByFile = ReadonlyMap<string, readonly CheckMessage[]>;

/** The old and the new messages from checks between files for one file of one fixture. */
export interface CheckComparison {
  readonly name: string;
  readonly caseId: string;
  readonly file: string;
  readonly old: readonly CheckMessage[];
  readonly new: readonly CheckMessage[];
  /** Whether old and new are exactly equal, in order. */
  readonly same: boolean;
}

/** One fixture and what the old loader's checks between files said about it. */
export interface CheckCase {
  readonly parityCase: ParityCase;
  readonly old: ChecksByFile;
  /**
   * The files on disk the old loader failed on their own, by their YAML or
   * their schema. Their messages are left out on both sides.
   */
  readonly leftOut: ReadonlySet<string>;
}

/** Whether the old loader failed a file on its own: its YAML or its schema. */
function failedOnItsOwn(file: FileRecording): boolean {
  return file.read && (file.schema === null || file.issues.length > 0);
}

/**
 * Groups messages by file, keeping each file's in the order given. Use it for
 * the new side too, so both sides are built alike.
 */
export function checksByFile(
  messages: readonly (CheckMessage & { readonly file: string })[],
): ChecksByFile {
  const byFile = new Map<string, CheckMessage[]>();
  for (const { file, severity, message } of messages) {
    byFile.set(file, [...(byFile.get(file) ?? []), { severity, message }]);
  }
  return byFile;
}

/**
 * What the old loader's checks between files said in one fixture. A case's
 * recording lists only its own files, so the base's recording names the rest:
 * the old loader named a file by its flat path (a hub's routines under
 * `hubs/<hub>/routines/`), and the compare uses the path on disk. A message
 * about a folder, such as an old layout, keeps the old name. Each file's
 * messages keep the order `recorded.json` lists them in.
 *
 * Files that failed on their own are left out: their messages are the file's
 * own result, which the compare of each file checks. Only the old recording
 * decides which files those are, so the new loader can't hide a file's
 * messages by failing it.
 */
export function oldChecks(
  recording: Recording,
  base: Recording,
): Pick<CheckCase, "old" | "leftOut"> {
  const files = [...base.files, ...recording.files];
  const fileOf = new Map(files.map((file) => [file.flatPath, file.file]));
  const failed = new Set(files.filter(failedOnItsOwn).map((file) => file.flatPath));
  // The case's own record of a file replaces the base's.
  for (const file of recording.files.filter((file) => !failedOnItsOwn(file))) {
    failed.delete(file.flatPath);
  }
  const old = checksByFile(
    recording.diagnostics
      .filter((diagnostic) => !failed.has(diagnostic.path))
      .map(({ severity, path, message }) => ({
        file: fileOf.get(path) ?? path,
        severity,
        message,
      })),
  );
  const leftOut = new Set([...failed].map((path) => fileOf.get(path) ?? path));
  return { old, leftOut };
}

function recordingOf(folder: string): Recording {
  return JSON.parse(readFileSync(join(folder, "recorded.json"), "utf8")) as Recording;
}

/** Every fixture, the base first, with the old loader's messages from checks between files. */
export function checkCases(fixtures: string): CheckCase[] {
  const base = recordingOf(join(fixtures, "base"));
  return loadCases(fixtures).map((parityCase) => ({
    parityCase,
    ...oldChecks(recordingOf(parityCase.folder), base),
  }));
}

/**
 * Compares one fixture, file by file: the same messages, with the same
 * severity, in the same order. Files are in path order; a file only one side
 * names is compared with no messages on the other. The files the old loader
 * failed on their own are left out on both sides.
 */
export function compareChecks(checkCase: CheckCase, fresh: ChecksByFile): CheckComparison[] {
  const { parityCase, old, leftOut } = checkCase;
  const files = [...new Set([...old.keys(), ...fresh.keys()])]
    .filter((file) => !leftOut.has(file))
    .sort();
  return files.map((file) => {
    const before = old.get(file) ?? [];
    const after = fresh.get(file) ?? [];
    return {
      name: `${parityCase.id}: ${file}`,
      caseId: parityCase.id,
      file,
      old: before,
      new: after,
      same: deepEqual(before, after),
    };
  });
}
