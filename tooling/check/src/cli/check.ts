import { loadContext } from "../lib/context.ts";
import { formatAnnotation, formatProblem, type Problem } from "../lib/problems.ts";
import { findRepoRoot } from "../lib/workspace.ts";
import { rules } from "../rules/all.ts";
import { phaseOneSlots } from "../rules/phase-one-slots.ts";

/**
 * pnpm check [rule ...]
 *
 * Runs our own repo checks. With rule names it
 * runs only those. The personal-terms guard has its own command,
 * `pnpm check:terms`, because CI runs it with a secret.
 */
function main(argv: readonly string[]): number {
  const selected = argv.filter((argument) => !argument.startsWith("-"));
  const unknown = selected.filter((name) => !(name in rules));
  if (unknown.length > 0) {
    console.error(`Unknown rule: ${unknown.join(", ")}. Rules: ${Object.keys(rules).join(", ")}.`);
    return 2;
  }
  const started = performance.now();
  const context = loadContext(findRepoRoot());
  const problems: Problem[] = [];
  for (const [name, rule] of Object.entries(rules)) {
    if (selected.length === 0 || selected.includes(name)) {
      problems.push(...rule(context).problems);
    }
  }
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  for (const problem of problems) {
    console.log(annotate ? formatAnnotation(problem) : formatProblem(problem));
  }
  for (const [name, purpose] of Object.entries(phaseOneSlots)) {
    if (selected.length === 0 || selected.includes(name)) {
      console.log(`${name}: not active yet. It will check that ${purpose}.`);
    }
  }
  const errors = problems.filter((problem) => problem.severity === "error").length;
  const warnings = problems.length - errors;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `check: ${errors} error(s), ${warnings} warning(s) in ${context.packages.length} packages and ${context.files.length} files (${seconds}s).`,
  );
  return errors === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
