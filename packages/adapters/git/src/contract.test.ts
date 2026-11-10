import { plantedHooks, vcsContract } from "@halonicjs/testing-contracts";
import { afterAll, beforeEach } from "vitest";
import { Scratch } from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { gitVcsHarness, remoteRunner } from "./harness.test-helper.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let runner: Promise<GitRunner> | undefined;
const sharedRunner = (): Promise<GitRunner> => {
  runner ??= remoteRunner(scratch);
  return runner;
};

/**
 * The contract cases the git Vcs can't pass yet, each with the requirement
 * that says why. Until git part 4 of HAL-3245, `git.vcs-worktrees` refuses
 * the worktree and patch methods; part 4 deletes this list. The memory Vcs
 * runs every case.
 *
 * Each listed case still runs on git, and must fail with that refusal and
 * nothing else: a skip would hide it, and a listed case that starts to pass
 * fails the run, so the list can't outlive part 4.
 */
const notOnGitYet: readonly (readonly [name: string | RegExp, requirement: string])[] = [
  [
    "adds a worktree at a snapshot without the private entries, so it has no changes",
    "git.vcs-worktrees",
  ],
  ["adds a worktree at an older commit", "git.vcs-worktrees"],
  [
    "adds a worktree holding a snapshot's files, and leaves the workspace as it was",
    "git.vcs-worktrees",
  ],
  ["adds every worktree outside the workspace folder", "git.vcs-worktrees"],
  ["applies a patch of two hunks in one go", "git.vcs-worktrees"],
  [
    "applies one hunk to the working tree only, and reversing it gives the file back",
    "git.vcs-worktrees",
  ],
  ["gives diffs that apply to the workspace and give it the worktree's files", "git.vcs-worktrees"],
  [
    "gives every worktree its own id and folder, and lists only the ones it added",
    "git.vcs-worktrees",
  ],
  ["keeps a worktree's files and the workspace's files apart", "git.vcs-worktrees"],
  ["leaves a private entry written in a worktree out of its changes", "git.vcs-worktrees"],
  ["lists nothing for a worktree with no changes", "git.vcs-worktrees"],
  [
    "lists the files a worktree added, changed and deleted, sorted, with a diff each",
    "git.vcs-worktrees",
  ],
  [
    "never lists a private entry HEAD tracks as changed, and never lets a patch change it",
    "git.vcs-worktrees",
  ],
  ["never runs planted code in worktrees or patches", "git.vcs-worktrees"],
  ["never trusts the .git file in a worktree's folder", "git.vcs-worktrees"],
  ["reads a worktree id only as an id it gave, never as a path or an option", "git.vcs-worktrees"],
  [
    "refuses a full id that names a tree or a file in the worktree methods, and changes nothing",
    "git.vcs-worktrees",
  ],
  [
    "refuses every version that isn't a full commit id in the worktree methods, and changes nothing",
    "git.vcs-worktrees",
  ],
  [
    "refuses to remove or diff a worktree it doesn't know, and changes nothing",
    "git.vcs-worktrees",
  ],
  ["removes a worktree with changed files, and only that one", "git.vcs-worktrees"],
  ["reverses one hunk of two, and keeps the other", "git.vcs-worktrees"],
  // The patch safety cases, one per refused path and patch shape.
  [/^refuses a patch that /u, "git.vcs-worktrees"],
];

const matches = (name: string | RegExp, title: string): boolean =>
  typeof name === "string" ? name === title : name.test(title);
const refusal =
  /The git Vcs can't (?:addWorktree|removeWorktree|listWorktrees|diffBetween|applyPatch) yet \(HAL-3245\)\./u;
/** Whether a failure is the refusal, thrown or caught by an assertion that wanted another error. */
const isRefusal = (error: { message: string; actual?: string }): boolean =>
  refusal.test(error.message) || refusal.test(error.actual ?? "");

/**
 * Marks the running case as one that must fail, as `it.fails` would. Vitest
 * types `fails` read-only, but its runner reads it only after the test body
 * and the `onTestFailed` hooks, so a `beforeEach` may still set it. That order
 * isn't a documented API, so `realFailures` below doesn't rely on it.
 */
function expectFailure(task: { readonly fails?: boolean | undefined }, fails: boolean): void {
  (task as { fails?: boolean }).fails = fails;
}

/**
 * The listed cases that failed for a reason other than the refusal. Clearing
 * `fails` already keeps such a failure, but if a later vitest read `fails`
 * before the `onTestFailed` hooks, the case would quietly pass. The `afterAll`
 * below fails the run for every case recorded here, so a real failure can't
 * pass on any vitest. Errors from `aroundEach` fixture cleanup come after the
 * `onTestFailed` hooks, so this check doesn't see them.
 */
const realFailures: string[] = [];

beforeEach(({ task, onTestFailed }) => {
  if (!notOnGitYet.some(([name]) => matches(name, task.name))) return;
  expectFailure(task, true);
  onTestFailed(({ task: failed }) => {
    const errors = failed.result?.errors ?? [];
    if (errors.length > 0 && errors.every(isRefusal)) return;
    // Any other failure is a real one: keep it.
    expectFailure(failed, false);
    realFailures.push(failed.name);
  });
});

afterAll(() => {
  if (realFailures.length === 0) return;
  throw new Error(
    `These cases are listed in notOnGitYet but failed for another reason than the git.vcs-worktrees refusal:\n${realFailures.join("\n")}`,
  );
});

vcsContract("git", gitVcsHarness(scratch, sharedRunner, plantedHooks));
