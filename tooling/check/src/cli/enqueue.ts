import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRepoRoot } from "../lib/workspace.ts";
import { badSubjects, commitSubjectsIn } from "./pr-title.ts";

/**
 * pnpm check:enqueue
 *
 * The check to run before you queue a pull request. It tests your branch
 * merged with the latest `origin/main`, as the merge queue will: if your branch
 * is behind, it merges `origin/main` into a temporary worktree and runs there.
 * First it checks the subject that will land on `main`: the pull request title
 * (read with `gh`, if it is signed in) and, for a one-commit branch, that
 * commit's subject, as the queue's squash commit subject check does.
 * Steps: frozen lockfile, typecheck of every package (tests included), the
 * `@halonicjs/format` spec tests, the process-starts guard and the requirement
 * guard. No other tests, no mutation tests, no builds. It prints only the
 * lines that say what failed (`##[error]`, `Failed:`, `error TS`, `FAIL`),
 * never search a log for words like "verified" or "approval".
 */
interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

const failureLine = /##\[error\]|Failed:|error TS\d+|\bFAIL\b|✗|Error:/;
const fallbackLines = 15;

function run(command: string, args: readonly string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function git(cwd: string, ...args: string[]): string | undefined {
  const result = run("git", args, cwd);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/** Prints the lines of a failed step that name the failure; the tail if none do. */
function printFailure(output: string): void {
  const lines = output.split("\n");
  const matching = lines.filter((line) => failureLine.test(line));
  for (const line of matching.length > 0 ? matching : lines.slice(-fallbackLines)) {
    console.error(`  ${line}`);
  }
}

/** The open pull request's title for this branch, if `gh` can tell. */
function pullRequestTitle(cwd: string): string | undefined {
  const result = run("gh", ["pr", "view", "--json", "title", "--jq", ".title"], cwd);
  return result.status === 0 && result.stdout.trim() !== "" ? result.stdout.trim() : undefined;
}

/** Prints the subjects that would fail the queue's squash subject check; true if any. */
function badLandingSubjects(root: string): boolean {
  const commits = commitSubjectsIn("origin/main..HEAD", root);
  const title = pullRequestTitle(root);
  if (title === undefined) {
    console.log(
      "squash subject: no pull request title from gh, so only a single commit's subject is checked.",
    );
  }
  const bad = badSubjects(title, commits);
  for (const subject of bad) {
    console.error(
      `✗ subject "${subject}" is not "type(scope): summary" of at most 100 characters.`,
    );
  }
  if (bad.length > 0) {
    console.error(
      "\nFailed: squash commit subject. With one commit, its subject lands on main, not the pull request title. Fix it before you queue the pull request.",
    );
  }
  return bad.length > 0;
}

function steps(base: string, branch: string): readonly Step[] {
  return [
    {
      label: "frozen lockfile",
      command: "pnpm",
      args: ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    },
    {
      label: "typecheck, every package",
      command: "pnpm",
      args: ["exec", "turbo", "run", "typecheck", "--concurrency=2", "--output-logs=errors-only"],
    },
    {
      label: "format spec tests",
      command: "pnpm",
      args: ["--filter", "@halonicjs/format", "test"],
    },
    {
      label: "process-starts guard",
      command: "pnpm",
      args: ["run", "--silent", "check", "process-starts"],
    },
    {
      label: "requirement guard",
      command: "node",
      args: [
        "tooling/check/src/cli/requirement-guard.ts",
        "--base",
        base,
        "--branch",
        branch,
        "--skip-test-runs",
      ],
    },
  ];
}

function runChecks(): number {
  const root = findRepoRoot();
  const branch = git(root, "branch", "--show-current");
  if (branch === undefined || branch === "") {
    console.error("check:enqueue: check out your branch first (it is on a detached HEAD).");
    return 2;
  }
  if (git(root, "status", "--porcelain") !== "") {
    console.error("check:enqueue: commit or stash your changes first; it tests what is committed.");
    return 2;
  }
  if (git(root, "fetch", "origin", "main") === undefined) {
    console.error("check:enqueue: `git fetch origin main` failed.");
    return 2;
  }
  const scratch = mkdtempSync(join(tmpdir(), "enqueue-"));
  const baseDir = join(scratch, "base");
  const mergeDir = join(scratch, "merged");
  try {
    if (git(root, "worktree", "add", "--detach", baseDir, "origin/main") === undefined) {
      console.error("check:enqueue: could not check out origin/main.");
      return 2;
    }
    let testRoot = root;
    if (run("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"], root).status !== 0) {
      console.log("▶ branch is behind origin/main: testing a temporary merge");
      if (git(root, "worktree", "add", "--detach", mergeDir, "HEAD") === undefined) {
        console.error("check:enqueue: could not check out your branch for the merge.");
        return 2;
      }
      const merged = run("git", ["merge", "--no-edit", "origin/main"], mergeDir);
      if (merged.status !== 0) {
        console.error(
          "✗ origin/main doesn't merge cleanly. Rebase on origin/main and fix the conflicts.",
        );
        console.error(merged.stderr.trim());
        return 1;
      }
      testRoot = mergeDir;
    }
    const started = performance.now();
    for (const step of steps(baseDir, branch)) {
      const stepStarted = performance.now();
      const result = run(step.command, step.args, testRoot);
      const seconds = ((performance.now() - stepStarted) / 1000).toFixed(1);
      if (result.status !== 0) {
        console.error(`✗ ${step.label} (${seconds}s)`);
        printFailure(`${result.stdout}\n${result.stderr}`);
        console.error(`\nFailed: ${step.label}. Fix it before you queue the pull request.`);
        return 1;
      }
      console.log(`✓ ${step.label} (${seconds}s)`);
    }
    const total = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`\n✓ check:enqueue passed in ${total}s. CI runs the rest.`);
    return 0;
  } finally {
    for (const dir of [mergeDir, baseDir]) {
      run("git", ["worktree", "remove", "--force", dir], root);
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main(): number {
  return badLandingSubjects(findRepoRoot()) ? 1 : runChecks();
}

process.exitCode = main();
