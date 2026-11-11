// The steps a Try it run can't try because they start a program that reads
// the workspace from disk (Julian's condition from the review of
// halonic#1499, HAL-4728, on HAL-3246). Try it holds a file that isn't an
// item back only in its own source, in memory. A stdio connector without a
// pin runs in the workspace, and a harness agent works in a folder inside
// it: both would read the held-back file as it is on disk, the change the
// person hasn't accepted. So while such a file is held back, those steps
// are can't-try and no program starts.
//
// Held-back parts of items (an agent's permissions or connectors, say) are
// on disk too, but a program only reads them as text: what a step may do
// comes from Try it's own source. A file that isn't an item can be code the
// program runs, so only those count.

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
   * workspace, so it can't read a held-back file unless an absolute path
   * in its arguments or environment points it there.
   */
  readonly pinned: ReadonlySet<string>;
}

/**
 * The steps of `item` that would start a program reading the workspace
 * from disk while a file that isn't an item is held back (requirement
 * `app.try-it-programs-see-try-it-source`): a stdio connector that isn't
 * pinned or is given an absolute path, or an agent in a harness program,
 * whose working folder is always in the workspace. Each is `needs-left-out-change` and names the first such
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
 * Whether the file is a stdio connector that may read the workspace, or an
 * agent that runs in a harness program. `halonic` is Halonic's own loop,
 * which starts no program.
 */
function startsProgram(file: LoadedFile, pinned: ReadonlySet<string>): boolean {
  if (file.kind === "agent") {
    return file.value.harness !== undefined && file.value.harness !== "halonic";
  }
  if (file.kind === "connector" && "stdio" in file.value.transport) {
    const { args, env = {} } = file.value.transport.stdio;
    const values = [...args, ...Object.values(env)];
    return !pinned.has(file.value.id) || values.some(mayPointOutsideItsFolder);
  }
  return false;
}

/**
 * A POSIX root, a home folder (`~`), a Windows root or network share
 * (`\acme`, `\\server`), optionally after a short option with its value
 * attached (`-r/srv/acme`). A Windows drive (`C:\`) needs no rule of
 * its own: splitting at its `:` leaves a piece that starts at a root.
 */
const absolutePathStart = /^(-[A-Za-z])?[\\/~]/;

/** A `..` path segment, at the start of a piece or after a path separator. */
const parentSegment = /(^|[\\/])\.\.([\\/]|$)/;

/** A `file:` URI, a form some servers take for their roots. */
const fileUri = /file:/i;

/**
 * Where one value can hold more than one path: after `=` (`--root=/srv`),
 * in a list (`docs,/srv`, `docs;/srv`, `docs:/srv`), or after a space when
 * an option and its path come as one string (`--root /srv`). A `:` before
 * `//` belongs to a URL (`https://…`), so it doesn't split.
 */
const pieceSeparator = /[=,;\s]|:(?!\/\/)/;

/**
 * Whether an argument or environment value could name a path outside the
 * connector's own folder, and so point a pinned connector back at the
 * workspace (a filesystem server given the workspace folder, say). This
 * check doesn't know where the workspace is, so it fails safe: any piece
 * of the value that is an absolute path counts, as does any `..` segment,
 * since enough of them reach the root from any folder, and any `file:`
 * URI. Matching too much only makes a step can't-try while a non-item
 * file is held back.
 */
function mayPointOutsideItsFolder(value: string): boolean {
  if (fileUri.test(value)) {
    return true;
  }
  return value
    .split(pieceSeparator)
    .some((piece) => absolutePathStart.test(piece) || parentSegment.test(piece));
}
