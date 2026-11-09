import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, type ParityCase, type Recording, readCase } from "@halonicjs/testing-parity";
import { loadWorkspace, type WorkspaceIssue } from "../load-workspace.ts";
import { MemorySource } from "./memory-source.ts";

/** The parity package's made-up fixtures: a valid base workspace and cases that each break one thing. */
export const parityFixtures = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "testing",
  "parity",
  "fixtures",
);

function readFiles(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of listFiles(folder)) {
    files[path] = readFileSync(join(folder, path), "utf8");
  }
  return files;
}

let baseFiles: Record<string, string> | undefined;

/** The base workspace's files, read once: every case starts from them, and a slow disk reads 32 files slowly. */
function readBaseFiles(): Record<string, string> {
  baseFiles ??= readFiles(join(parityFixtures, "base", "files"));
  return baseFiles;
}

/**
 * A parity case's workspace in memory, the way the parity package's
 * `composeWorkspace` builds it on disk: the base files, the case's own on
 * top (same path replaces), minus the files it removes. The base is `base`.
 */
export function caseSource(parityCase: ParityCase): MemorySource {
  const files =
    parityCase.id === "base"
      ? { ...readBaseFiles() }
      : { ...readBaseFiles(), ...readFiles(join(parityCase.folder, "files")) };
  for (const path of parityCase.remove) {
    delete files[path];
  }
  return new MemorySource(files);
}

/** A parity case, its workspace in memory, and what the old loader recorded for it. */
export interface LoadedCase {
  readonly parityCase: ParityCase;
  /** The base files, the case's own on top (same path replaces), minus the files it removes. */
  readonly source: MemorySource;
  readonly recording: Recording;
}

/**
 * Reads one parity case, such as `agent/unknown-model`, and builds its
 * workspace in memory the way the parity package's `composeWorkspace` builds
 * it on disk.
 */
export function readParityCase(id: string): LoadedCase {
  const parityCase = readCase(id, join(parityFixtures, "cases", id));
  const recording = JSON.parse(
    readFileSync(join(parityCase.folder, "recorded.json"), "utf8"),
  ) as Recording;
  return { parityCase, source: caseSource(parityCase), recording };
}

/** An error as the tests compare it: where it is, and the old loader's words. */
export interface FoundError {
  readonly file: string;
  /** The key path joined with dots; `""` for the whole file. */
  readonly path: string;
  readonly line: number | null;
  readonly message: string;
}

function foundError(issue: WorkspaceIssue): FoundError {
  return { file: issue.file, path: issue.path.join("."), line: issue.line, message: issue.message };
}

/** The errors a parity case's workspace gives. */
export async function errorsOf(caseId: string): Promise<FoundError[]> {
  const workspace = await loadWorkspace(readParityCase(caseId).source);
  return workspace.issues.filter((issue) => issue.severity === "error").map(foundError);
}

/** The one error a parity case expects: the old loader's message, where its case file says. */
export function expectedError(caseId: string): FoundError {
  const { parityCase, recording } = readParityCase(caseId);
  const messages = recording.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.message);
  if (parityCase.expect === null || messages.length !== 1) {
    throw new Error(`${caseId}: expected one recorded error and a place for it`);
  }
  const { file, path, line } = parityCase.expect;
  return { file, path, line, message: messages[0] ?? "" };
}

/** A parity case's workspace has 32 files; loading it takes seconds under a full verify. */
export const parityLoadLimitMs = 60_000;
