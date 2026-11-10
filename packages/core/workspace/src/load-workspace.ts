import {
  type FileProblem,
  isReservedPath,
  type KindName,
  type KindValues,
  parseFile,
} from "@halonicjs/format";
import { type DefinitionSource, isUnreadableWorkspaceFolderError } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { ReadFile } from "./checks/check-context.ts";
import { checkWorkspace } from "./checks/check-workspace.ts";
import { placeOf } from "./places.ts";

/**
 * Something wrong with a workspace, and where: the file, the key path in it
 * and the line and column. The fields after `file` are format's
 * `FileProblem`, so an editor shows a loader issue the way it shows a parse
 * problem.
 */
export interface WorkspaceIssue extends FileProblem {
  /** The workspace-relative path of the file, with `/` separators. */
  readonly file: string;
}

/** One file that parsed, of one kind. */
export interface LoadedFileOf<Name extends KindName> {
  /** The workspace-relative path, with `/` separators. */
  readonly path: string;
  readonly kind: Name;
  /** The hub folder the file sits in, or `null` at the workspace root. */
  readonly hub: string | null;
  /** The value with every default filled in. */
  readonly value: KindValues[Name];
}

/** One file that parsed, of any kind; `kind` tells which. */
export type LoadedFile = { [Name in KindName]: LoadedFileOf<Name> }[KindName];

/** A workspace read through a {@link DefinitionSource}: its files by kind and every issue found. */
export interface LoadedWorkspace {
  /** The source's location, such as "memory:demo". */
  readonly location: string;
  /** The source's version of the definitions, read before the files. */
  readonly version: string;
  /** Every file that parsed, sorted by path. A file with an error is not among them. */
  readonly files: readonly LoadedFile[];
  /**
   * Every error and warning, in the order of the files' paths: first each
   * file's own, then those of the checks across files.
   */
  readonly issues: readonly WorkspaceIssue[];
  /**
   * The files no kind places, such as a README or a file in an older
   * layout, sorted. The reserved `.halonic/` folders are left out.
   */
  readonly ignored: readonly string[];
}

/** What one file gave: its parsed value, its issues, or nothing because no kind places it. */
type FileOutcome =
  | {
      readonly read: ReadFile;
      readonly loaded: LoadedFile | null;
      readonly issues: readonly WorkspaceIssue[];
    }
  | { readonly ignored: string };

/**
 * Loads one workspace: lists the source, finds each file's kind from where
 * it sits (the registered kinds' places drive it), and parses it with that
 * kind. Files in the reserved `.halonic/` folders are skipped.
 *
 * Then it checks across files: what one file names in another, such as an
 * agent's model alias, and rules over several files, such as agents that
 * delegate in a loop. A file that didn't parse counts as missing there.
 *
 * @param source - where the workspace files live
 * @returns the parsed files, every issue with its file, key path and line,
 *   and the files no kind places
 * @throws KindedError `invalid_input` naming the file or folder when the
 *   account may not read one of the workspace's files or folders
 *
 * @example
 * const workspace = await loadWorkspace(source);
 * for (const issue of workspace.issues) report(issue.file, issue.line, issue.message);
 * const agents = filesOf(workspace, "agent");
 */
export async function loadWorkspace(source: DefinitionSource): Promise<LoadedWorkspace> {
  const version = await versionOf(source);
  const paths = (await listPaths(source)).filter((path) => !isReservedPath(path));
  const outcomes = await Promise.all(paths.map((path) => loadFile(source, path)));
  const files: LoadedFile[] = [];
  const read: ReadFile[] = [];
  const issues: WorkspaceIssue[] = [];
  const ignored: string[] = [];
  for (const outcome of outcomes) {
    if (outcome === null) {
      continue;
    }
    if ("ignored" in outcome) {
      ignored.push(outcome.ignored);
      continue;
    }
    read.push(outcome.read);
    if (outcome.loaded !== null) {
      files.push(outcome.loaded);
    }
    issues.push(...outcome.issues);
  }
  issues.push(...checkWorkspace(files, read));
  return { location: source.location, version, files, issues: byFile(issues), ignored };
}

async function loadFile(source: DefinitionSource, path: string): Promise<FileOutcome | null> {
  const place = placeOf(path);
  if (place === undefined) {
    return { ignored: path };
  }
  const text = await readText(source, path);
  if (text === null) {
    // Removed between list and read: the workspace no longer has the file.
    return null;
  }
  const read: ReadFile = { path, kind: place.kind, text };
  const options = place.placeId === undefined ? {} : { id: place.placeId };
  const parsed = parseFile(place.kind, text, options);
  if (!parsed.ok) {
    const issues = parsed.error.map((problem) => ({ ...problem, file: path }));
    return { read, loaded: null, issues };
  }
  // The registry types each kind's value by its name; parseFile keeps that
  // link, but a union over every kind can't follow it, hence the cast.
  const loaded = {
    path,
    kind: place.kind,
    hub: place.hub,
    value: parsed.value.value,
  } as LoadedFile;
  const issues = parsed.value.warnings.map((problem) => ({ ...problem, file: path }));
  return { read, loaded, issues };
}

/**
 * The codes a store gives for a file the account may not read: `EACCES` on
 * Linux and macOS, `EPERM` on Windows. They are Node's, but the loader only
 * reads them off the error, so core uses no Node API.
 */
const unreadableCodes: ReadonlySet<unknown> = new Set(["EACCES", "EPERM"]);

/**
 * The source's version. A folder store works it out from every file's text,
 * so a file the account may not read fails it first, and its error knows the
 * file only by its place on disk. Reading each file finds the one to name. A
 * folder it may not read fails it too, but that error names the folder.
 *
 * @throws KindedError `invalid_input` naming the file or folder that can't be read
 */
async function versionOf(source: DefinitionSource): Promise<string> {
  try {
    return await source.version();
  } catch (error) {
    if (isUnreadableWorkspaceFolderError(error)) {
      throw unreadableFolder(error.path, error);
    }
    if (!isUnreadable(error)) {
      throw error;
    }
    for (const path of await listPaths(source)) {
      await readText(source, path);
    }
    // Every file reads on its own: pass on what the source said.
    throw error;
  }
}

/**
 * The source's files, as {@link DefinitionSource.list} gives them. A folder
 * the account may not read is the user's to fix, as a file is (see
 * {@link readText}), so it becomes an error that names the folder. The store
 * names it by its workspace path, so core needs no Node API to find it.
 *
 * @throws KindedError `invalid_input` when a folder can't be read
 */
async function listPaths(source: DefinitionSource): Promise<string[]> {
  try {
    return await source.list();
  } catch (error) {
    if (isUnreadableWorkspaceFolderError(error)) {
      throw unreadableFolder(error.path, error);
    }
    throw error;
  }
}

/** The user error for a workspace folder the account may not read, keeping the store's error as its cause. */
function unreadableFolder(path: string, cause: unknown): KindedError {
  return new KindedError("invalid_input", `the workspace folder ${path} can't be read.`, {
    fix: "Check the folder's permissions, or move it out of the workspace.",
    cause,
  });
}

/**
 * The file's text, as {@link DefinitionSource.read} gives it. A file the
 * account may not read is the user's to fix, so it becomes an error that
 * names the file and says what to do, not a crash. Any other failure is
 * passed on as it is.
 *
 * @throws KindedError `invalid_input` when the file can't be read
 */
async function readText(source: DefinitionSource, path: string): Promise<string | null> {
  try {
    return await source.read(path);
  } catch (error) {
    if (!isUnreadable(error)) {
      throw error;
    }
    throw new KindedError("invalid_input", `the workspace file ${path} can't be read.`, {
      fix: "Check the file's permissions, or move it out of the workspace.",
      cause: error,
    });
  }
}

/** True for an error with one of the {@link unreadableCodes}. */
export function isUnreadable(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && unreadableCodes.has(Reflect.get(error, "code"))
  );
}

/** The issues sorted by their file's path; those of one file keep their order. */
function byFile(issues: readonly WorkspaceIssue[]): WorkspaceIssue[] {
  // Sorting is stable, and paths compare by code unit, as the source lists them.
  return [...issues].sort((a, b) => {
    if (a.file === b.file) {
      return 0;
    }
    return a.file < b.file ? -1 : 1;
  });
}

/**
 * The parsed files of one kind, sorted by path.
 *
 * @example
 * for (const agent of filesOf(workspace, "agent")) console.log(agent.hub, agent.value.name);
 */
export function filesOf<Name extends KindName>(
  workspace: LoadedWorkspace,
  kind: Name,
): LoadedFileOf<Name>[] {
  return workspace.files.filter(
    (file): file is LoadedFileOf<Name> & LoadedFile => file.kind === kind,
  );
}
