// The pure part of the migrations-additive rule. Other repos (Cloud) import it through the
// `@halonicjs/tooling-check/migrations-additive` subpath, so this file imports nothing.

/** `ALTER TABLE <name>`, which can be followed by any amount of whitespace, newlines included. */
const alterTable = String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?\S+\s+`;

/** Anything up to the end of the statement: a semicolon or the end of a string literal. */
const sameStatement = "[^;`\"']*";

// In SQLite the word COLUMN is optional, so the forms below work with and without it.
const destructive: readonly (readonly [pattern: RegExp, message: string])[] = [
  [/\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b/gi, "drops something"],
  [new RegExp(`${alterTable}DROP\\b`, "gi"), "drops something"],
  [new RegExp(`${alterTable}RENAME\\b`, "gi"), "renames something"],
  [/\bALTER\s+COLUMN\b|\bMODIFY\s+COLUMN\b/gi, "changes a column's type or constraint"],
  [
    new RegExp(
      `${alterTable}ADD\\b(?!\\s+(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\\b)` +
        `(?=${sameStatement}\\bNOT\\s+NULL\\b)(?!${sameStatement}\\bDEFAULT\\b)`,
      "gi",
    ),
    "adds a NOT NULL column with no default",
  ],
];

/** Blanks out comments, keeping every newline so line numbers stay right. */
function blankComments(text: string): string {
  const blank = (comment: string) => comment.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\s)\/\/[^\n]*/g, blank)
    .replace(/--[^\n]*/g, blank);
}

/**
 * Finds the lines (1-based) where statements that aren't additive start, with what is wrong. The
 * whole file is read at once, so a statement split over several lines is still found. Comments
 * are skipped.
 *
 * @example
 * findDestructiveStatements('"DROP TABLE users"');
 * // [{ line: 1, problem: "drops something" }]
 */
export function findDestructiveStatements(text: string): { line: number; problem: string }[] {
  const code = blankComments(text);
  const found = new Map<string, { line: number; problem: string }>();
  for (const [pattern, problem] of destructive) {
    for (const match of code.matchAll(pattern)) {
      const line = code.slice(0, match.index).split("\n").length;
      found.set(`${line}:${problem}`, { line, problem });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}
