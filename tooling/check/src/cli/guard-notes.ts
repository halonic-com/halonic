import { changedFiles, gitObjects, mergeBaseOf } from "../guard/git-objects.ts";
import { checkNotes } from "../guard/note-check.ts";
import { formatAnnotation, formatProblem } from "../lib/problems.ts";
import { findRepoRoot } from "../lib/workspace.ts";

const usage =
  "Usage: node tooling/check/src/cli/guard-notes.ts --repo <owner/name> --pr <number> --branch <name> --head-sha <sha> --base-sha <sha>";

/**
 * The note check (HAL-1337), run by `guard-notes.yml` from the base
 * branch's checkout (the current folder). The pull request's head commit
 * must be fetched into it; it is only read, as git objects.
 */
async function main(argv: readonly string[]): Promise<number> {
  const flag = (name: string): string | undefined => {
    const value = argv[argv.indexOf(name) + 1];
    return argv.includes(name) && value !== undefined && !value.startsWith("--")
      ? value
      : undefined;
  };
  const [repo, branch, head, base] = ["--repo", "--branch", "--head-sha", "--base-sha"].map(flag);
  const number = Number(flag("--pr"));
  if (!repo || !branch || !head || !base || !Number.isSafeInteger(number) || number < 1) {
    console.error(usage);
    return 2;
  }
  const root = findRepoRoot();
  const report = await checkNotes({
    pull: { repo, number, head, base },
    branch,
    changed: changedFiles(root, base, head),
    mergeBase: mergeBaseOf(root, base, head),
    git: gitObjects(root),
  });
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  for (const problem of report.problems) {
    console.log(annotate ? formatAnnotation(problem) : formatProblem(problem));
  }
  console.log(`guard-notes: ${report.problems.length} error(s).`);
  return report.problems.length === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
