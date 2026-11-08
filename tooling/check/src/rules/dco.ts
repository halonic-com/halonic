import type { CheckContext } from "../lib/context.ts";
import { dcoProblem, readCommits } from "../lib/dco.ts";
import { Report } from "../lib/problems.ts";

// Revisions such as `origin/main~2`; never an option such as `--output=…`.
const rangePattern = /^(?!-)[\w./~^-]+\.\.[\w./~^-]+$/;

/**
 * The commit range the DCO rule checks: `DCO_RANGE`, which CI sets to the
 * pull request's `BASE..HEAD`. Undefined when it isn't set.
 */
export function dcoRange(): string | undefined {
  const range = process.env["DCO_RANGE"]?.trim() ?? "";
  return range === "" ? undefined : range;
}

/**
 * The GitHub login that opened the pull request: `DCO_PR_AUTHOR`, which CI
 * sets. Undefined when it isn't set, so no commit counts as covered.
 */
export function dcoPullRequestAuthor(): string | undefined {
  const login = process.env["DCO_PR_AUTHOR"]?.trim() ?? "";
  return login === "" ? undefined : login;
}

/**
 * Every commit in a pull request carries the sign-off the contribution
 * policy asks for, or is covered by the standing statement.
 * Without a range there is nothing to check, so a local `pnpm check`
 * passes; CI always sets one for pull requests.
 */
export function checkDco(
  context: CheckContext,
  range = dcoRange(),
  pullRequestAuthor = dcoPullRequestAuthor(),
): Report {
  const report = new Report("dco");
  if (range === undefined) {
    return report;
  }
  if (!rangePattern.test(range)) {
    report.error("DCO_RANGE", `DCO_RANGE must be BASE..HEAD, got "${range}".`);
    return report;
  }
  for (const commit of readCommits(context.root, range)) {
    const problem = dcoProblem(commit, pullRequestAuthor);
    if (problem !== undefined) {
      report.error(`commit ${commit.hash.slice(0, 10)}`, problem);
    }
  }
  return report;
}
