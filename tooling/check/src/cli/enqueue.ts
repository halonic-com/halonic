import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * pnpm check:enqueue
 *
 * The check to run before you queue a pull request. It tests your branch
 * merged with the latest `origin/main`, as the merge queue will: if your branch
 * is behind, it merges `origin/main` into a temporary worktree and runs there.
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

function main(): number {
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

process.exitCode = main();
