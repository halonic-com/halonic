import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/** A migration file: a numbered `.ts` file in a `migrations` folder, not its test. */
const migrationFile = /(^|\/)migrations\/\d+-[^/]*(?<!\.test)\.ts$/;

const destructive: readonly (readonly [pattern: RegExp, message: string])[] = [
  [/\bDROP\s+(TABLE|INDEX|COLUMN|VIEW|TRIGGER)\b/i, "drops something"],
  [/\bRENAME\s+(TO|COLUMN)\b/i, "renames something"],
  [/\bALTER\s+COLUMN\b|\bMODIFY\s+COLUMN\b/i, "changes a column's type or constraint"],
  [
    /\bADD\s+COLUMN\b(?=[^,;`"']*\bNOT\s+NULL\b)(?![^,;`"']*\bDEFAULT\b)/i,
    "adds a NOT NULL column with no default",
  ],
];

/**
 * Finds the lines (1-based) of statements that aren't additive, with what is wrong. Comment
 * lines are skipped.
 *
 * @example
 * findDestructiveStatements('"DROP TABLE users"');
 * // [{ line: 1, problem: "drops something" }]
 */
export function findDestructiveStatements(text: string): { line: number; problem: string }[] {
  const found: { line: number; problem: string }[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) {
      return;
    }
    for (const [pattern, problem] of destructive) {
      if (pattern.test(line)) {
        found.push({ line: index + 1, problem });
      }
    }
  });
  return found;
}

/**
 * Fails on a migration that isn't additive. A deploy applies migrations before the new code
 * serves, so a released version still runs against the new schema until traffic switches (and
 * after a rollback). Migrations only add: tables, indexes, and columns that are nullable or have
 * a default. Removing something goes in a later migration, once no released version uses it.
 */
export function checkMigrationsAdditive(context: CheckContext): Report {
  const report = new Report("migrations-additive");
  for (const file of context.files.filter((name) => migrationFile.test(name))) {
    for (const { line, problem } of findDestructiveStatements(context.read(file))) {
      report.error(
        file,
        `This migration ${problem}. Migrations only add: new tables, new indexes, and new columns that are nullable or have a default. Remove things in a later migration, once no released version uses them.`,
        line,
      );
    }
  }
  return report;
}
