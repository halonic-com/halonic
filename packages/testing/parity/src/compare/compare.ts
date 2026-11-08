import type { FileCheck } from "./file-checks.ts";

/**
 * One problem with a file, as both sides are compared: its key path, its
 * code, and its line and column (null where the old code gave none). A YAML
 * syntax problem has the code `syntax` and the path `[]` on both sides: the
 * old loader gave it no code of its own.
 */
export interface Problem {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly line: number | null;
  readonly col: number | null;
}

/** What one side, old or new, says about one file on its own. */
export interface Side {
  readonly status: "pass" | "fail";
  readonly problems: readonly Problem[];
}

/**
 * A problem the new code reports, in the shape of format's `FileProblem`.
 * Only the fields the compare reads are listed; it takes all of them.
 */
export interface NewProblem {
  readonly severity: "error" | "warning";
  readonly source: "syntax" | "schema" | "check";
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly line: number;
  readonly col: number;
}

/** What the new code's `parseFile` returns for one file. */
export type NewResult =
  | { readonly ok: true; readonly value: { readonly warnings: readonly NewProblem[] } }
  | { readonly ok: false; readonly error: readonly NewProblem[] };

/** The old and the new result for one file. */
export interface Comparison {
  readonly name: string;
  readonly caseId: string;
  readonly file: string;
  readonly kind: string;
  readonly old: Side;
  readonly new: Side;
  /**
   * The old loader's errors on this file that come from checks between files
   * (unknown references, workflow rules). The new loader does those in
   * phase 2; `parseFile` reads one file, so it can't. The file's own part is
   * still compared.
   */
  readonly loaderErrors: readonly string[];
  /** Whether old and new are exactly equal. */
  readonly same: boolean;
}

/** The old YAML error the loader gave a file whose YAML didn't parse. */
function oldSyntaxProblem(check: FileCheck): Problem {
  const found = check.diagnostics.find(
    (d) => d.path === check.recorded.flatPath && d.message.startsWith("YAML:"),
  );
  if (found === undefined) {
    throw new Error(`${check.name}: no schema ran, but the recording has no YAML error`);
  }
  return { path: [], code: "syntax", line: found.line ?? null, col: found.col ?? null };
}

/** The old side: the schema issues of the file alone, or its YAML error. */
export function oldSide(check: FileCheck): Side {
  if (check.recorded.schema === null) {
    return { status: "fail", problems: [oldSyntaxProblem(check)] };
  }
  const problems = check.recorded.issues.map((issue) => ({
    path: issue.path,
    code: issue.code,
    line: issue.line ?? null,
    col: issue.col ?? null,
  }));
  return { status: problems.length === 0 ? "pass" : "fail", problems };
}

/**
 * The new side: every error `parseFile` gave. Warnings are left out, as the
 * old schema issues had none; a result that isn't ok fails all the same.
 */
export function newSide(result: NewResult): Side {
  if (result.ok) {
    return { status: "pass", problems: [] };
  }
  const problems = result.error
    .filter((problem) => problem.severity === "error")
    .map((problem) => ({
      path: problem.path,
      code: problem.source === "syntax" ? "syntax" : problem.code,
      line: problem.line,
      col: problem.col,
    }));
  return { status: "fail", problems };
}

/** The old loader's errors on the file that its schema and YAML didn't give. */
function loaderErrorsOf(check: FileCheck, old: Side): string[] {
  if (check.recorded.status !== "fail" || old.status === "fail") {
    return [];
  }
  return check.diagnostics
    .filter((d) => d.severity === "error" && d.path === check.recorded.flatPath)
    .map((d) => d.message);
}

/** Whether two values are equal, key by key and item by item. Key order doesn't count. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => Object.hasOwn(bRecord, key) && deepEqual(aRecord[key], bRecord[key]))
  );
}

/**
 * Compares one file: pass or fail, and each problem's path, code, line and
 * column, in order. Exact: nothing is dropped or rounded.
 */
export function compareFile(check: FileCheck, result: NewResult): Comparison {
  const old = oldSide(check);
  const fresh = newSide(result);
  return {
    name: check.name,
    caseId: check.caseId,
    file: check.file,
    kind: check.kind,
    old,
    new: fresh,
    loaderErrors: loaderErrorsOf(check, old),
    same: deepEqual(old, fresh),
  };
}
