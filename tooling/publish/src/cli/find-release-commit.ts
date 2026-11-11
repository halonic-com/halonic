import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { commitsOfPush, findReleaseCommit } from "../release-commit.ts";

/**
 * Used by the Version packages workflow: finds the merged release pull
 * request among the commits of a push (BEFORE..SHA) and writes `release`,
 * `release_sha` and `version` to GITHUB_OUTPUT. When the pull request
 * lookup fails it warns and finds nothing, so the run can be re-run.
 */
const { REPO = "", SHA = "", BEFORE = "", GITHUB_OUTPUT } = process.env;
function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" });
}

const commits = commitsOfPush(BEFORE, SHA, (range) =>
  run("git", ["rev-list", "--reverse", range]).split("\n").filter(Boolean),
);
let lookupFailed = false;
const release = findReleaseCommit(
  commits,
  (sha) => JSON.parse(run("git", ["show", `${sha}:apps/studio/package.json`])).version,
  (sha) => {
    try {
      return run("gh", ["api", `repos/${REPO}/commits/${sha}/pulls`, "--jq", ".[].title"])
        .split("\n")
        .filter(Boolean);
    } catch {
      lookupFailed = true;
      console.log(
        `::warning::The release check could not run: GitHub did not answer the pull request lookup for ${sha}. If this push merged a release pull request, re-run this failed push run to tag it.`,
      );
      return [];
    }
  },
);
const lines = [`release=${release !== undefined}`];
if (release) lines.push(`release_sha=${release.sha}`, `version=${release.version}`);
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `${lines.join("\n")}\n`);
console.log(
  release
    ? `Release pull request ${release.version} merged in ${release.sha} (${commits.length} commit(s) pushed).`
    : `No release pull request among ${commits.length} pushed commit(s).${lookupFailed ? " Lookup failed; nothing tagged." : ""}`,
);
