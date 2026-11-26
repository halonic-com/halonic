import ts from "@typescript/typescript6";
import type { Problem, ProblemRule } from "./messages.ts";

/** Parses a ToolScript into a syntax tree, without types and without running anything. */
export function parseToolScript(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
}

/** Collects problems while the rules walk one file. */
export class Problems {
  readonly #file: ts.SourceFile;
  readonly #found: Problem[] = [];

  /** Starts an empty list for this file. */
  constructor(file: ts.SourceFile) {
    this.#file = file;
  }

  /** Adds a problem at a node's first character, or at a position in the text. */
  add(rule: ProblemRule, message: string, at: ts.Node | number): void {
    const position = typeof at === "number" ? at : at.getStart(this.#file);
    const place = this.#file.getLineAndCharacterOfPosition(position);
    this.#found.push({ rule, message, line: place.line + 1, column: place.character + 1 });
  }

  /** How many problems so far. */
  get count(): number {
    return this.#found.length;
  }

  /** Every problem, in the order they appear in the file. */
  sorted(): Problem[] {
    return [...this.#found].sort((a, b) => a.line - b.line || a.column - b.column);
  }
}
