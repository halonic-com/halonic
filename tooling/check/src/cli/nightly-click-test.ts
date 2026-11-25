import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { needsClickTest, nightlyClickTestTitle } from "../lib/nightly-click-test.ts";

/**
 * node tooling/check/src/cli/nightly-click-test.ts [--repo owner/name] [--apply]
 *
 * Run from a checkout of main. Finds the commit of the last nightly click
 * test that finished (`studio-preview.yml`, HAL-18356) and says whether
 * `apps/studio/`, `apps/agent-host/` or `packages/studio/` changed since.
 * With `--apply` it then starts tonight's, of the checked-out commit. Needs
 * `gh`, signed in with actions:write, and `git`; a shallow checkout is
 * enough, since only the two commits' trees are compared.
 */

interface RunSummary {
  readonly head_sha: string;
  readonly conclusion: string | null;
  readonly display_title: string;
  readonly html_url: string;
}

function run(command: string, ...args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The newest nightly click test on main that passed or failed; a cancelled one tested nothing. */
function lastNightly(repo: string): RunSummary | undefined {
  const runs = run(
    "gh",
    "api",
    `repos/${repo}/actions/workflows/studio-preview.yml/runs?branch=main&event=workflow_dispatch&status=completed&per_page=100`,
    "--jq",
    ".workflow_runs[] | {head_sha, conclusion, display_title, html_url}",
  )
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunSummary);
  return runs.find(
    (summary) =>
      summary.display_title.startsWith(nightlyClickTestTitle) &&
      (summary.conclusion === "success" || summary.conclusion === "failure"),
  );
}

/** The files changed between the last nightly's commit and `head`. */
function changedSince(commit: string, head: string): string[] {
  run("git", "fetch", "--quiet", "--no-tags", "--depth=1", "origin", commit);
  return run("git", "diff", "--name-only", commit, head)
    .split("\n")
    .filter((line) => line !== "");
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: process.env["GITHUB_REPOSITORY"] ?? "halonic-com/halonic" },
      apply: { type: "boolean", default: false },
    },
  });
  const head = run("git", "rev-parse", "HEAD").trim();
  const last = lastNightly(values.repo);
  const changed = last === undefined ? undefined : changedSince(last.head_sha, head);
  if (!needsClickTest(changed)) {
    console.log(
      `nightly-click-test: skipped, the desktop app hasn't changed since ${last?.html_url}.`,
    );
  } else {
    console.log(
      last === undefined
        ? `nightly-click-test: no earlier nightly, testing ${head}.`
        : `nightly-click-test: the desktop app changed since ${last.html_url}, testing ${head}.`,
    );
    if (values.apply) {
      run(
        "gh",
        "workflow",
        "run",
        "studio-preview.yml",
        "--repo",
        values.repo,
        "--ref",
        "main",
        "-f",
        `build-ref=${head}`,
        "-f",
        "nightly=true",
      );
    }
  }
}
