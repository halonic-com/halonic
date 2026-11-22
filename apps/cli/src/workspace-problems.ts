// A workspace whose files have errors (HAL-6613). `loadWorkspace` leaves
// each such file out, so what loads is not the workspace the user wrote: a
// provider file with a pasted key is missing, and the workspace can look as
// if it only reached the test model. A run doesn't start while a file it
// loads has an error, as `errorsStoppingRun` decides it, the same rule as
// Studio's Run (HAL-15127); `test` runs every workflow, so any error stops
// it, and `routines watch` leaves out a routine whose own file has errors
// and stops for any other (HAL-15372). `doctor` shows every error as a problem, until
// `halonic validate` finds none. `run` and the watch read the live version,
// while `validate` reads the saved files, so when the saved files have none
// of the errors that stop a run, the refusal says the fix isn't live yet
// instead of pointing to `validate`, which would find nothing (C666 #2).

import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
import { routineKey } from "@halonicjs/routines";
import { KindedError } from "@halonicjs/std";
import {
  errorsStoppingRun,
  filesOf,
  type LoadedWorkspace,
  misplacedFileCode,
  placeOf,
  type WorkflowRef,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { workspaceMessages } from "./messages/workspace.ts";
import { printable } from "./output/printable.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { workspaceNameOf } from "./workspace-trust.ts";

/**
 * The errors `halonic validate` finds in the workspace's files, in the order
 * it lists them: the problems that leave a file out or stop a run. `doctor`
 * counts the same ones (`fileProblemsOf` in `@halonicjs/adapter-doctor-node`).
 */
function fileErrorsOf(workspace: LoadedWorkspace): WorkspaceIssue[] {
  return workspaceProblemsOf(workspace).filter((issue) => issue.severity === "error");
}

/** A routine whose own file has errors, so it can't start until they're fixed. */
export interface RoutineWithProblems {
  /** `<hub>/<routine id>`, as the routine scheduler keys it. */
  readonly key: string;
  /** Its name, or for a file that doesn't load, the routine id its file's name gives. */
  readonly name: string;
}

/**
 * The routines whose own files have errors, in the order of their files'
 * paths, as `halonic routines` marks them "Can't start".
 */
export function routinesWithProblemsOf(workspace: LoadedWorkspace): RoutineWithProblems[] {
  const names = new Map(filesOf(workspace, "routine").map((file) => [file.path, file.value.name]));
  const routines = new Map<string, RoutineWithProblems>();
  for (const issue of fileErrorsOf(workspace)) {
    const place = placeOf(issue.file);
    if (place?.kind !== "routine" || place.placeId === undefined) continue;
    const key = routineKey({ hub: place.hub, routine: { id: place.placeId } });
    routines.set(issue.file, { key, name: names.get(issue.file) ?? place.placeId });
  }
  return [...routines.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, each]) => each);
}

function isOnARoutineFile(issue: WorkspaceIssue): boolean {
  return placeOf(issue.file)?.kind === "routine";
}

/**
 * How many files the loader skipped with a `misplaced-file` warning: files
 * meant as a kind's that Halonic doesn't read for their folder or name, such
 * as a hub outside `hubs/` or `models.yml`. A workflow among them looks missing.
 */
export function misplacedFilesOf(workspace: LoadedWorkspace): number {
  return workspace.issues.filter((issue) => issue.code === misplacedFileCode).length;
}

/** Loads the saved files, as `halonic validate` reads them. */
export type SavedWorkspace = () => Promise<LoadedWorkspace>;

/** The files a refusal names, how many errors they have, and whether a saved fix mends them all. */
export interface FileProblems {
  readonly workspace: string;
  readonly count: number;
  readonly files: readonly string[];
  /** The saved files have none of the errors, so `validate` finds nothing (C666 #2). */
  readonly fixSaved: boolean;
}

/**
 * A run refused because the workspace's files have errors: `invalid_input`,
 * exit 2, as for any file the user gave that is wrong. It names the files,
 * and the fix points at `halonic validate`, which lists the problems, or,
 * when the saved files have none, says to commit the fix or make it live;
 * the problems themselves aren't repeated here, so a pasted key in one never
 * reaches this error.
 */
export class WorkspaceFileProblemsError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "workspace-file-problems";

  constructor(problems: FileProblems, nothingDone: Message, typedDir?: string) {
    const { workspace, count, files } = problems;
    const reason = problems.fixSaved
      ? workspaceMessages.fixNotLive(workspace, count, files, nothingDone.phrase)
      : workspaceMessages.fileProblems(workspace, count, files, nothingDone.phrase);
    const fix = problems.fixSaved
      ? workspaceMessages.fixNotLiveFix(count)
      : workspaceMessages.fileProblemsFix(count, typedDir);
    super("invalid_input", plainText(reason.phrase), { fix: plainText(fix.phrase) });
  }
}

/** What else a refusal reads: the one workflow that runs, and the saved files. */
export interface RefusalScope {
  /**
   * The one workflow that runs, whose errors stop it; absent when every
   * workflow may run, or the workflow wasn't found, so any error stops it.
   */
  readonly run?: WorkflowRef | undefined;
  /**
   * The saved files, when the workspace read is the live version: read only
   * when it has an error, to tell whether the fix is saved but not live.
   */
  readonly saved?: SavedWorkspace;
}

/**
 * Refuses to go on when the workspace's files have errors that stop the run,
 * before anything starts: "✕ Couldn't run support-reply: Acme has 2 problems
 * in providers/mock.yaml. Nothing ran." and "See them with: halonic validate"
 * ("See it with" for one problem). When `scope.saved` has none of them:
 * "✕ Couldn't run support-reply: Acme's last commit has 1 problem in
 * models.yaml, and its fix isn't live yet. Nothing ran." and "Commit the fix
 * or make it live in Halonic Studio, then try again."
 *
 * @param nothingDone - the end of line 1: "Nothing ran." or "Nothing was sent."
 * @param typedDir - the user's own `--dir`, for the suggested command
 * @throws WorkspaceFileProblemsError when such an error is in the files
 */
export async function refuseFileProblems(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  nothingDone: Message,
  typedDir: string | undefined,
  scope: RefusalScope = {},
): Promise<void> {
  const { run } = scope;
  const errorsIn = (each: LoadedWorkspace) =>
    run === undefined
      ? fileErrorsOf(each)
      : errorsStoppingRun(each, workspaceProblemsOf(each), run);
  await refuseErrors(dir, workspace, errorsIn, { nothingDone, typedDir, saved: scope.saved });
}

/**
 * {@link refuseFileProblems} for the errors outside the routine files only:
 * `routines watch` leaves a routine whose own file has errors out and
 * starts the others, as `halonic routines` lists them (HAL-15372). A
 * routine's file decides only when its own run starts, not what any run
 * reaches, so the trust rule judges the same workspace with it left out.
 *
 * @throws WorkspaceFileProblemsError when another file has an error
 */
export async function refuseFileProblemsOutsideRoutines(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  nothingDone: Message,
  typedDir: string | undefined,
  saved?: SavedWorkspace,
): Promise<void> {
  const errorsIn = (each: LoadedWorkspace) =>
    fileErrorsOf(each).filter((issue) => !isOnARoutineFile(issue));
  await refuseErrors(dir, workspace, errorsIn, { nothingDone, typedDir, saved });
}

/** How a refusal ends and what it reads beyond the workspace. */
interface RefusalWords {
  readonly nothingDone: Message;
  readonly typedDir: string | undefined;
  readonly saved: SavedWorkspace | undefined;
}

async function refuseErrors(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  errorsIn: (workspace: LoadedWorkspace) => readonly WorkspaceIssue[],
  words: RefusalWords,
): Promise<void> {
  const errors = errorsIn(workspace);
  if (errors.length === 0) return;
  const name = printable(workspaceNameOf(workspace, dir));
  // A file name is the user's own text, so it is shown as safely as the
  // workspace's name. An error in no file has no name to show.
  const named = errors.map((issue) => issue.file).filter((file) => file !== "");
  const files = [...new Set(named.map(printable))];
  const fixSaved = await savedHasNone(words.saved, errorsIn);
  const problems = { workspace: name, count: errors.length, files, fixSaved };
  throw new WorkspaceFileProblemsError(problems, words.nothingDone, words.typedDir);
}

/**
 * Whether the saved files have none of the errors `errorsIn` counts. Saved
 * files that can't be loaded count as having them, so the refusal keeps
 * pointing to `validate`, which says why.
 */
async function savedHasNone(
  saved: SavedWorkspace | undefined,
  errorsIn: (workspace: LoadedWorkspace) => readonly WorkspaceIssue[],
): Promise<boolean> {
  if (saved === undefined) return false;
  try {
    return errorsIn(await saved()).length === 0;
  } catch {
    return false;
  }
}
