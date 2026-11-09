import { type FileProblem, fileKinds, type KindName } from "@halonicjs/format";
import { readYaml, type SourcePosition } from "@halonicjs/yaml";
import type { LoadedFile, LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";

/** One file as the loader read it: its path, its kind and its text. */
export interface ReadFile {
  readonly path: string;
  readonly kind: KindName;
  readonly text: string;
}

/** Where an issue points when nothing better is known: the start of the file. */
const fileStart: SourcePosition = { line: 1, col: 1 };

/** The keys and list indexes to a value; `[]` for the whole file. */
type Path = FileProblem["path"];

/**
 * What every check across files gets: the files that parsed, the kinds of
 * every file the loader read (also those that failed), and a way to report
 * an error at a key path with its line.
 *
 * A file that failed its own checks is not among `files`, so whatever names
 * it is reported as unknown, as the old loader did.
 */
export class CheckContext {
  readonly files: readonly LoadedFile[];
  private readonly read: ReadonlyMap<string, ReadFile>;
  private readonly positions = new Map<string, (path: Path) => SourcePosition>();

  constructor(files: readonly LoadedFile[], read: readonly ReadFile[]) {
    this.files = files;
    this.read = new Map(read.map((file) => [file.path, file]));
  }

  /** The parsed files of one kind, sorted by path; with `hub`, only those in that hub (`null`: the root). */
  filesOf<Name extends KindName>(kind: Name, hub?: string | null): LoadedFileOf<Name>[] {
    return this.files.filter(
      (file): file is LoadedFileOf<Name> & LoadedFile =>
        file.kind === kind && (hub === undefined || file.hub === hub),
    );
  }

  /** Whether the loader read a file of this kind, whether it parsed or not. */
  hasReadKind(kind: KindName): boolean {
    for (const file of this.read.values()) {
      if (file.kind === kind) {
        return true;
      }
    }
    return false;
  }

  /**
   * An error at a key path of a file, with the line and column of the value
   * there, or of its nearest parent that exists.
   */
  error(file: string, path: Path, code: string, message: string): WorkspaceIssue {
    return {
      severity: "error",
      source: "check",
      code,
      path,
      message,
      file,
      ...this.positionOf(file, path),
    };
  }

  /** Reads a file's positions only when an issue points into it: most files have none. */
  private positionOf(file: string, path: Path): SourcePosition {
    let find = this.positions.get(file);
    if (find === undefined) {
      find = this.positionFinder(file);
      this.positions.set(file, find);
    }
    return find(path);
  }

  private positionFinder(file: string): (path: Path) => SourcePosition {
    const read = this.read.get(file);
    // Front matter, such as a SKILL.md, has nothing the checks point into.
    if (read === undefined || fileKinds[read.kind].syntax !== "yaml") {
      return () => fileStart;
    }
    const yaml = readYaml(read.text);
    if (!yaml.ok) {
      return () => fileStart;
    }
    return (path) => yaml.value.positionOf(path) ?? fileStart;
  }
}
