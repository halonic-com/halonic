import { spawnSync } from "node:child_process";
import { readPullRequestText } from "../lib/pull-request.ts";

/**
 * Checks the pull request title against Conventional Commits, because
 * squash merges use it as the commit message. In CI the title
 * comes from the event file; locally, set PR_TITLE. With one commit, the
 * squash commit's subject is that commit's own subject, so it gets the same
 * check: set PR_RANGE (`base..head`) and the commits in it are read from git.
 */

const types = ["feat", "fix", "docs", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
const pattern = new RegExp(`^(?:${types.join("|")})(?:\\([a-z0-9][a-z0-9-]*\\))?!?: \\S.{0,99}$`);

/** True when the title is `type(scope): summary` with a known type. */
export function isConventionalTitle(title: string): boolean {
  return pattern.test(title);
}

/**
 * The subject that lands on `main` when the pull request is squash merged: the
 * commit's own subject for one commit, the title otherwise.
 */
export function squashSubject(title: string, commitSubjects: readonly string[]): string {
  return commitSubjects.length === 1 ? (commitSubjects[0] ?? title) : title;
}

/**
 * Subjects that would fail the merge queue's check. The title is checked when
 * it is known; the single commit's subject too, when there is exactly one.
 */
export function badSubjects(
  title: string | undefined,
  commitSubjects: readonly string[],
): string[] {
  const subjects = title === undefined ? [] : [title];
  if (commitSubjects.length === 1 && commitSubjects[0] !== undefined) {
    subjects.push(commitSubjects[0]);
  }
  return [...new Set(subjects)].filter((subject) => !isConventionalTitle(subject));
}

/** Subjects of the commits in a `base..head` range, or `[]` if git can't read it. */
export function commitSubjectsIn(range: string, cwd?: string): string[] {
  const result = spawnSync("git", ["log", "--format=%s", range], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split("\n").filter((line) => line !== "");
}

if (import.meta.main) {
  const title = readPullRequestText()?.title ?? process.env["PR_TITLE"] ?? "";
  const range = process.env["PR_RANGE"];
  const commits = range === undefined || range === "" ? [] : commitSubjectsIn(range);
  if (range !== undefined && range !== "" && commits.length === 0) {
    console.error(`pr-title: could not read any commits in ${range}.`);
    process.exit(1);
  }
  const bad = badSubjects(title, commits);
  if (bad.length === 0) {
    console.log("pr-title: ok.");
  } else {
    if (commits.length === 1 && bad.includes(commits[0] ?? "")) {
      console.error(
        `pr-title: the pull request has one commit, so its subject lands on main: "${commits[0]}". Reword it (git commit --amend) or add a commit.`,
      );
    }
    console.error(
      `pr-title: use "type(scope): summary" with a type from ${types.join(", ")}, at most 100 characters. Example: "feat(check): fail on deep imports".`,
    );
    process.exitCode = 1;
  }
}
