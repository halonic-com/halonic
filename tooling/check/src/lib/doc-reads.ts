import type { CheckContext } from "./context.ts";
import { isTestFile } from "./source-files.ts";
import { owningPackage } from "./workspace.ts";

/** One doc a test reads by a path out of its package. */
export interface DocRead {
  /** The test file that reads it. */
  readonly file: string;
  /** Its 1-based line. */
  readonly line: number;
  /** The doc's path from the repo root. */
  readonly doc: string;
  /** The test's package by name, or the test file when it is in none. */
  readonly reader: string;
}

/**
 * A doc path a test reaches out of its package: after one or more `../`, or
 * as the path joined to `findRepoRoot()`.
 */
const docPath = /(?:(?:\.\.\/)+|findRepoRoot\(\),\s*["'`])(docs\/[\w./-]+\.md)/g;

/** Every doc a test file in `context` reads by a path out of its package. */
export function findDocReads(
  context: Pick<CheckContext, "files" | "packages" | "read">,
): DocRead[] {
  const reads: DocRead[] = [];
  for (const file of context.files.filter(isTestFile)) {
    const reader = owningPackage(file, context.packages)?.manifest.name ?? file;
    // The whole text, not line by line: the formatter may put the path on
    // the line after `findRepoRoot(),`.
    const text = context.read(file);
    for (const match of text.matchAll(docPath)) {
      const doc = match[1] ?? "";
      const end = match.index + match[0].length;
      reads.push({ file, line: lineAt(text, end), doc, reader });
    }
  }
  return reads;
}

/** The 1-based line of the character before `offset`. */
function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}
