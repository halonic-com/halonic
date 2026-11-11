// The steps a Try it run can't try because they start a program that reads
// the workspace from disk (Julian's condition from the review of
// halonic#1499, HAL-4728, on HAL-3246). Try it holds a file that isn't an
// item back only in its own source, in memory. A stdio connector without a
// pin runs in the workspace, and a harness agent works in a folder inside
// it: both would read the held-back file as it is on disk, the change the
// person hasn't accepted. So while such a file is held back, those steps
// are can't-try and no program starts.

import type { CantTryStep } from "@halonicjs/events";
import { type LoadedFile, type LoadedWorkspace, placeOf } from "@halonicjs/workspace";
import type { LeftOutFile } from "./review-types.ts";
import type { RunFiles } from "./try-it-run-files.ts";

/** What finding the steps that would start a program needs. */
export interface ProgramsInput {
  /** The path of the workflow or agent being tried. */
  readonly item: string;
  /** The workspace as Try it reads it: what the run would start. */
  readonly tried: LoadedWorkspace;
  /** The files the run reads, from `runFilesOf`. */
  readonly runFiles: RunFiles;
  /** Every left-out file, workspace-wide. */
  readonly leftOut: readonly LeftOutFile[];
  /**
   * The ids of the connectors pinned in the workspace's trust record. A
   * pinned connector runs its package in its own folder, never the
   * workspace, so it can't read a held-back file.
   */
  readonly pinned: ReadonlySet<string>;
}

/**
 * The steps of `item` that would start a program reading the workspace
 * from disk while a file that isn't an item is held back (requirement
 * `app.try-it-programs-see-try-it-source`): a stdio connector that isn't
 * pinned, or an agent in a harness program, whose working folder is
 * always in the workspace. Each is `needs-left-out-change` and names the first such
 * file. For an agent being tried, the entry has no step.
 *
 * @returns one entry per step, in the workflow's order; empty when no file that isn't an item is held back
 */
export function cantTryForPrograms(input: ProgramsInput): CantTryStep[] {
  const [held] = input.leftOut.filter((file) => placeOf(file.path) === undefined);
  if (held === undefined) {
    return [];
  }
  const reason = {
    kind: "needs-left-out-change",
    path: held.path,
    leftOut: held.reason,
  } as const;
  const { item, runFiles } = input;
  const readers: [string | null, ReadonlySet<string>][] =
    runFiles.byStep.size === 0 ? [[null, runFiles.all]] : [...runFiles.byStep];
  return readers
    .filter(([, files]) => startsProgramInWorkspace(input, files))
    .map(([step]) => ({ status: "cant-try", item, step, reason }));
}

/** Whether any of `files`, as Try it reads them, starts a program in the workspace. */
function startsProgramInWorkspace(input: ProgramsInput, files: ReadonlySet<string>): boolean {
  return input.tried.files.some(
    (file) => files.has(file.path) && startsProgram(file, input.pinned),
  );
}

/**
 * Whether the file is a stdio connector without a pin, or an agent that
 * runs in a harness program. `halonic` is Halonic's own loop, which starts
 * no program.
 */
function startsProgram(file: LoadedFile, pinned: ReadonlySet<string>): boolean {
  if (file.kind === "agent") {
    return file.value.harness !== undefined && file.value.harness !== "halonic";
  }
  if (file.kind === "connector") {
    return "stdio" in file.value.transport && !pinned.has(file.value.id);
  }
  return false;
}
