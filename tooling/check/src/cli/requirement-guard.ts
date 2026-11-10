import { resolve } from "node:path";
import { type PullRequest, signedApprovals } from "../guard/approvals.ts";
import { gitObjects } from "../guard/git-objects.ts";
import { checkRequirementGuard, guardChecks } from "../guard/guard.ts";
import { checkTestRuns } from "../guard/test-runs.ts";
import { loadContext } from "../lib/context.ts";
import { formatAnnotation, formatProblem } from "../lib/problems.ts";
import { findRepoRoot } from "../lib/workspace.ts";

const usage =
  "Usage: node tooling/check/src/cli/requirement-guard.ts --base <merge-base checkout> --branch <branch name> [--skip-test-runs] [--repo <owner/name> --pr <number> --head-sha <sha> --base-sha <sha>]";

/**
 * node <merge base>/tooling/check/src/cli/requirement-guard.ts --base <dir> --branch <name>
 *
 * The requirement guard. Run it from the pull request's checkout
 * (the current folder), with `--base` pointing at a checkout of the merge
 * base. Both checkouts' tests must have run, so their result files exist.
 * CI runs the merge base's copy of this file, so a pull request can't
 * weaken the guard that checks it. With `--skip-test-runs` it leaves out
 * the one check that reads test result files, so it runs without the tests
 * (`pnpm check:enqueue` does that; CI runs the full guard).
 *
 * `--repo`, `--pr`, `--head-sha` and `--base-sha` name the pull request a
 * note's signature must be for; both commits must be in the current
 * folder's git repo. Without all four no note's signature verifies.
 */
async function main(argv: readonly string[]): Promise<number> {
  const base = flagValue(argv, "--base");
  const branch = flagValue(argv, "--branch");
  if (base === undefined || branch === undefined) {
    console.error(usage);
    return 2;
  }
  const started = performance.now();
  const headRoot = findRepoRoot();
  const report = await checkRequirementGuard({
    base: loadContext(resolve(base)),
    head: loadContext(headRoot),
    branch,
    approvals: signedApprovals(pullRequestOf(argv), gitObjects(headRoot)),
    checks: argv.includes("--skip-test-runs")
      ? guardChecks.filter((check) => check !== checkTestRuns)
      : guardChecks,
  });
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  for (const problem of report.problems) {
    console.log(annotate ? formatAnnotation(problem) : formatProblem(problem));
  }
  const errors = report.problems.filter((problem) => problem.severity === "error").length;
  const allowed = report.problems.length - errors;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `requirement-guard: ${errors} error(s), ${allowed} change(s) allowed by a decision note (${seconds}s).`,
  );
  return errors === 0 ? 0 : 1;
}

function pullRequestOf(argv: readonly string[]): PullRequest | undefined {
  const repo = flagValue(argv, "--repo");
  const number = Number(flagValue(argv, "--pr"));
  const head = flagValue(argv, "--head-sha");
  const base = flagValue(argv, "--base-sha");
  if (repo === undefined || !Number.isSafeInteger(number) || number < 1) {
    return undefined;
  }
  return head === undefined || base === undefined ? undefined : { repo, number, head, base };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  const value = at === -1 ? undefined : argv[at + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

process.exitCode = await main(process.argv.slice(2));
