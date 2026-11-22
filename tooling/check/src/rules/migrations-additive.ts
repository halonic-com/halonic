import type { CheckContext } from "../lib/context.ts";
import { findDestructiveStatements } from "../lib/destructive-statements.ts";
import { Report } from "../lib/problems.ts";

/** A migration file: a numbered `.ts` file in a `migrations` folder, not its test. */
const migrationFile = /(^|\/)migrations\/\d+-[^/]*(?<!\.test)\.ts$/;

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
