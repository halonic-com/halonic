import { type CheckContext, loadContext } from "../lib/context.ts";
import { formatAnnotation, formatProblem, type Problem } from "../lib/problems.ts";
import { findRepoRoot } from "../lib/workspace.ts";
import { rules, rulesAfterTests, selectRules } from "../rules/all.ts";
import { dcoRange } from "../rules/dco.ts";
import { inactiveChecks } from "../rules/inactive-checks.ts";

/**
 * pnpm check [rule ...]
 *
 * Runs our own repo checks. With rule names it
 * runs only those. Without, it runs every rule except `trace`, which reads
 * the test result files and so runs after the tests: `pnpm check trace`.
 * The personal-terms guard has its own command,
 * `pnpm check:leaks`, because CI runs it with a secret.
 */
function main(argv: readonly string[]): number {
  const selected = argv.filter((argument) => !argument.startsWith("-"));
  const unknown = selected.filter((name) => !Object.hasOwn(rules, name));
  if (unknown.length > 0) {
    console.error(`Unknown rule: ${unknown.join(", ")}. Rules: ${Object.keys(rules).join(", ")}.`);
    return 2;
  }
  const toRun = selectRules(selected);
  const started = performance.now();
  let context: CheckContext;
  try {
    context = loadContext(findRepoRoot());
  } catch (error) {
    console.error(`check: ${(error as Error).message}`);
    return 2;
  }
  const problems: Problem[] = [];
  for (const [name, rule] of Object.entries(rules)) {
    if (toRun.includes(name)) {
      problems.push(...rule(context).problems);
    }
  }
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  for (const problem of problems) {
    console.log(annotate ? formatAnnotation(problem) : formatProblem(problem));
  }
  for (const [name, purpose] of Object.entries(inactiveChecks)) {
    if (toRun.includes(name)) {
      console.log(`${name}: not active yet. It will check that ${purpose}.`);
    }
  }
  if ((selected.length === 0 || selected.includes("dco")) && dcoRange() === undefined) {
    console.log("dco: no commits to check; CI sets DCO_RANGE=BASE..HEAD for each pull request.");
  }
  if (selected.length === 0) {
    const names = rulesAfterTests.join(" ");
    console.log(`${names}: runs after the tests, with pnpm check ${names}.`);
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
