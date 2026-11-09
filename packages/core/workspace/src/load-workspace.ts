import {
  type FileProblem,
  isReservedPath,
  type KindName,
  type KindValues,
  parseFile,
} from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
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
  /** Every error and warning, in the order of the files' paths. */
  readonly issues: readonly WorkspaceIssue[];
  /**
   * The files no kind places, such as a README or a file in an older
   * layout, sorted. The reserved `.halonic/` folders are left out.
   */
  readonly ignored: readonly string[];
}

/** What one file gave: its parsed value, its issues, or nothing because no kind places it. */
type FileOutcome =
  | { readonly loaded: LoadedFile | null; readonly issues: readonly WorkspaceIssue[] }
  | { readonly ignored: string };

/**
 * Loads one workspace: lists the source, finds each file's kind from where
 * it sits (the registered kinds' places drive it), and parses it with that
 * kind. Files in the reserved `.halonic/` folders are skipped.
 *
 * Checks across files, such as an agent naming a provider that doesn't
 * exist, are not part of this step.
 *
 * @param source - where the workspace files live
 * @returns the parsed files, every issue with its file, key path and line,
 *   and the files no kind places
 *
 * @example
 * const workspace = await loadWorkspace(source);
 * for (const issue of workspace.issues) report(issue.file, issue.line, issue.message);
 * const agents = filesOf(workspace, "agent");
 */
export async function loadWorkspace(source: DefinitionSource): Promise<LoadedWorkspace> {
  const version = await source.version();
  const paths = (await source.list()).filter((path) => !isReservedPath(path));
  const outcomes = await Promise.all(paths.map((path) => loadFile(source, path)));
  const files: LoadedFile[] = [];
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
    if (outcome.loaded !== null) {
      files.push(outcome.loaded);
    }
    issues.push(...outcome.issues);
  }
  return { location: source.location, version, files, issues, ignored };
}

async function loadFile(source: DefinitionSource, path: string): Promise<FileOutcome | null> {
  const place = placeOf(path);
  if (place === undefined) {
    return { ignored: path };
  }
  const text = await source.read(path);
  if (text === null) {
    // Removed between list and read: the workspace no longer has the file.
    return null;
  }
  const options = place.placeId === undefined ? {} : { id: place.placeId };
  const parsed = parseFile(place.kind, text, options);
  if (!parsed.ok) {
    return { loaded: null, issues: parsed.error.map((problem) => ({ ...problem, file: path })) };
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
  return { loaded, issues };
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
