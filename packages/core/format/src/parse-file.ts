import { type Issue, type Path, parse } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import type { YamlProblem } from "@halonicjs/yaml";
import type { FileKind, KindCheckProblem } from "./kind.ts";
import { fileKinds, type KindName, type KindValues } from "./registry.ts";
import { isMap } from "./shared/legacy-keys.ts";
import { readSource, type Source } from "./source.ts";

/**
 * Something wrong with a file, and where. Every problem has a line and a
 * column, so an editor can always point at it.
 */
export interface FileProblem {
  /** An error makes the file fail; a warning only informs. */
  readonly severity: "error" | "warning";
  /**
   * `syntax`: the text isn't YAML we read (`code` is the YAML problem kind).
   * `schema`: the data doesn't match the kind's schema (`code` is
   * schema-kit's issue code). `check`: a rule over several fields (`code`
   * names the rule).
   */
  readonly source: "syntax" | "schema" | "check";
  readonly code: string;
  /** The keys and list indexes to the value; `[]` for the whole file. */
  readonly path: Path;
  /** What is wrong, without the path or position. */
  readonly message: string;
  /** 1-based line and column of the value, or of its nearest parent that exists. */
  readonly line: number;
  readonly col: number;
  /** For `unrecognized_keys`: the keys the map doesn't allow. */
  readonly keys?: readonly string[];
}

/** A file that parsed: its value with defaults filled in, and any warnings. */
export interface ParsedFile<Value> {
  readonly value: Value;
  readonly warnings: readonly FileProblem[];
}

/** What the caller knows about the file beyond its text. */
export interface ParseFileOptions {
  /**
   * The id the file's place gives it: its file name without the kind's
   * suffix, or its folder (see `FileKind.places`). Used as the kind's
   * `idFromPlace` says.
   */
  readonly id?: string;
}

/**
 * Reads and checks one workspace file of a known kind.
 *
 * @param kind - the file's kind, such as `agent`
 * @param text - the whole file
 * @param options - the id the file's place gives it
 * @returns the value with defaults and any warnings, or every problem found,
 *   each with its path, line and column
 *
 * @example
 * const parsed = parseFile("agent", text, { id: "clerk" });
 * if (!parsed.ok) {
 *   for (const problem of parsed.error) report(problem.line, problem.message);
 * }
 */
export function parseFile<Name extends KindName>(
  kind: Name,
  text: string,
  options: ParseFileOptions = {},
): Result<ParsedFile<KindValues[Name]>, FileProblem[]> {
  const fileKind: FileKind<KindValues[Name]> = fileKinds[kind];
  const read = readSource(fileKind.syntax, text);
  if (!read.ok) {
    return err([syntaxProblem(read.error)]);
  }
  const source = read.value;
  const prepared = prepare(fileKind, source.data, options.id);
  const parsed = parse(fileKind.schema, prepared.data);
  if (!parsed.ok) {
    const problems = parsed.error.map((issue) => schemaProblem(issue, source));
    return err(
      prepared.idFromPlace ? problems.map((problem) => namePlaceId(problem, options.id)) : problems,
    );
  }
  const found = fileKind.check?.(parsed.value) ?? [];
  const problems = found.map((problem) => checkProblem(problem, source));
  if (problems.some((problem) => problem.severity === "error")) {
    return err(problems);
  }
  return ok({ value: parsed.value, warnings: problems });
}

/** The data the kind's schema gets, and whether its id is the place's. */
export interface Prepared {
  readonly data: unknown;
  readonly idFromPlace: boolean;
}

/**
 * Old key names read as new ones, then the id from the file's place: the data
 * the kind's schema gets. Exported for the tests, not from the package.
 */
export function prepare(
  kind: Pick<FileKind<unknown>, "idFromPlace" | "upgradeKeys">,
  data: unknown,
  placeId: string | undefined,
): Prepared {
  if (!isMap(data)) {
    return { data, idFromPlace: false };
  }
  const upgraded = kind.upgradeKeys === undefined ? data : kind.upgradeKeys(data);
  if (placeId === undefined) {
    return { data: upgraded, idFromPlace: false };
  }
  if (kind.idFromPlace === "always") {
    return { data: { ...upgraded, id: placeId }, idFromPlace: true };
  }
  if (kind.idFromPlace === "fallback" && !Object.hasOwn(upgraded, "id")) {
    return { data: { id: placeId, ...upgraded }, idFromPlace: true };
  }
  return { data: upgraded, idFromPlace: false };
}

/**
 * An id problem says the id came from the file name when the file has none of
 * its own: its line and column would otherwise point at nothing in particular.
 */
function namePlaceId(problem: FileProblem, placeId: string | undefined): FileProblem {
  if (problem.path.length !== 1 || problem.path[0] !== "id") {
    return problem;
  }
  return {
    ...problem,
    message: `${problem.message} (the id "${placeId}" comes from the file name)`,
  };
}

function syntaxProblem(problem: YamlProblem): FileProblem {
  return {
    severity: "error",
    source: "syntax",
    code: problem.kind,
    path: [],
    message: problem.message,
    line: problem.line,
    col: problem.col,
  };
}

function schemaProblem(issue: Issue, source: Source): FileProblem {
  const problem: FileProblem = {
    severity: "error",
    source: "schema",
    code: issue.code,
    path: issue.path,
    message: issue.message,
    ...source.positionOf(issue.path),
  };
  return issue.keys === undefined ? problem : { ...problem, keys: issue.keys };
}

function checkProblem(problem: KindCheckProblem, source: Source): FileProblem {
  return {
    severity: problem.severity,
    source: "check",
    code: problem.code,
    path: problem.path,
    message: problem.message,
    ...source.positionOf(problem.path),
  };
}
