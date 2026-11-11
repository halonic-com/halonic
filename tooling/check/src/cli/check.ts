import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type CheckContext, loadContext } from "../lib/context.ts";
import { formatAnnotation, formatProblem, type Problem } from "../lib/problems.ts";
import {
  groupByPackage,
  renderRequirementReport,
  requirementReportFile,
} from "../lib/requirement-report.ts";
import { buildTraceModel } from "../lib/trace-model.ts";
import { findRepoRoot } from "../lib/workspace.ts";
import { rules, rulesAfterTests, selectRules } from "../rules/all.ts";
import { dcoRange } from "../rules/dco.ts";

/**
 * pnpm check [rule ...] [--report]
 *
 * Runs our own repo checks. With rule names it
 * runs only those. Without, it runs every rule except `trace`, which reads
 * the test result files and so runs after the tests: `pnpm check trace`.
 * With --lists-from <folder> the allow-lists (dependencies.json and the
 * other files under tooling/check) come from that checkout, and a missing
 * one is an error, so
 * CI can run the base commit's rules and lists over a pull request's tree.
 * With --report it also writes each package's requirement report to
 * test-results/requirements.md. The personal-terms guard has its own
 * command, `pnpm check:leaks`, because CI runs it with a secret.
 */
function parseArguments(
  argv: readonly string[],
): { selected: string[]; listsRoot?: string } | undefined {
  const listsAt = argv.indexOf("--lists-from");
  const listsRoot = listsAt === -1 ? undefined : argv[listsAt + 1];
  if (listsAt !== -1 && (listsRoot === undefined || listsRoot.startsWith("-"))) {
    console.error("check: --lists-from needs a folder.");
    return undefined;
  }
  const selected = argv.filter(
    (argument, index) => !argument.startsWith("-") && !(listsAt !== -1 && index === listsAt + 1),
  );
  return listsRoot === undefined ? { selected } : { selected, listsRoot };
}

function main(argv: readonly string[]): number {
  const parsed = parseArguments(argv);
  if (parsed === undefined) {
    return 2;
  }
  const { selected, listsRoot } = parsed;
  const unknown = selected.filter((name) => !Object.hasOwn(rules, name));
  if (unknown.length > 0) {
    console.error(`Unknown rule: ${unknown.join(", ")}. Rules: ${Object.keys(rules).join(", ")}.`);
    return 2;
  }
  const toRun = selectRules(selected);
  const started = performance.now();
  let context: CheckContext;
  try {
    context = loadContext(findRepoRoot(), listsRoot);
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
  if ((selected.length === 0 || selected.includes("dco")) && dcoRange() === undefined) {
    console.log("dco: no commits to check; CI sets DCO_RANGE=BASE..HEAD for each pull request.");
  }
  if (selected.length === 0) {
    const names = rulesAfterTests.join(" ");
    console.log(`${names}: runs after the tests, with pnpm check ${names}.`);
  }
  if (argv.includes("--report")) {
    writeRequirementReports(context);
  }
  const errors = problems.filter((problem) => problem.severity === "error").length;
  const warnings = problems.length - errors;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `check: ${errors} error(s), ${warnings} warning(s) in ${context.packages.length} packages and ${context.files.length} files (${seconds}s).`,
  );
  return errors === 0 ? 0 : 1;
}

function writeRequirementReports(context: CheckContext): void {
  const groups = groupByPackage(buildTraceModel(context).requirements);
  for (const group of groups) {
    const path = join(context.root, group.pkg.directory, requirementReportFile);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderRequirementReport(group));
  }
  console.log(`check: wrote the requirement report of ${groups.length} package(s).`);
}

process.exitCode = main(process.argv.slice(2));
