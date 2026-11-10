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
 * that says why. Until git part 5 of HAL-3245, `git.vcs-commits` refuses
 * Create version and the proposal ref methods; part 5 deletes this list.
 * The memory Vcs runs every case.
 *
 * Each listed case still runs on git, and must fail with that refusal and
 * nothing else: a skip would hide it, and a listed case that starts to pass
 * fails the run, so the list can't outlive part 5.
 */
const notOnGitYet: readonly (readonly [name: string | RegExp, requirement: string])[] = [
  ["commits each message as the message, whatever it starts with", "git.vcs-commits"],
  [
    "commits every change on disk, new, changed and deleted files alike, and leaves the files as they were",
    "git.vcs-commits",
  ],
  ["commits only the changes under include, files and folders alike", "git.vcs-commits"],
  ["commits what is on disk, not what is staged", "git.vcs-commits"],
  ["keeps a renamed item excluded by both its paths at its old path", "git.vcs-commits"],
  [
    "keeps each excluded change out of the version, at HEAD's content, and still a change",
    "git.vcs-commits",
  ],
  ["keeps every file under an excluded folder out of the version", "git.vcs-commits"],
  ["makes the first commit of a repository with none", "git.vcs-commits"],
  ["never commits a change under .halonic/review/, whatever .gitignore says", "git.vcs-commits"],
  ["never commits a private entry, even one the repository doesn't ignore", "git.vcs-commits"],
  // One case per file name that looks like an option or a pattern. The `*`
  // and `?` cases carry patternLikeIt's Windows reason first in their name.
  [
    /^(?:\[platform:win32\] Windows allows no \* or \? in a file name: )?reads ".+" in include and exclude as that file only, /u,
    "git.vcs-commits",
  ],
  [
    "refuses an unsafe or private path in include or exclude, and changes nothing",
    "git.vcs-commits",
  ],
  ["never runs planted code when creating a version or a proposal", "git.vcs-commits"],
  [
    "never trusts the .git file in a worktree's folder when committing a proposal",
    "git.vcs-commits",
  ],
  [
    "commits a worktree's files onto a proposal ref, on its parent, and changes nothing else",
    "git.vcs-commits",
  ],
  ["leaves private entries out of a proposal, even those HEAD tracks", "git.vcs-commits"],
  ["never takes a branch named like a proposal ref for one", "git.vcs-commits"],
  ["reads a missing ref as null, and deletes a ref only once", "git.vcs-commits"],
  ["refuses a parent that isn't a full commit id, and creates no ref", "git.vcs-commits"],
  ["refuses a ref that already exists, and keeps the first proposal", "git.vcs-commits"],
  ["refuses a worktree id it didn't give, and creates no ref", "git.vcs-commits"],
  [
    "refuses every ref that isn't a proposal ref, in every method, and changes nothing",
    "git.vcs-commits",
  ],
  ["takes any commit as the parent, not only the worktree's own", "git.vcs-commits"],
  ["takes every ref the rule allows", "git.vcs-commits"],
];

const matches = (name: string | RegExp, title: string): boolean =>
  typeof name === "string" ? name === title : name.test(title);
const refusal =
  /The git Vcs can't (?:commitVersion|commitWorktreeTo|readRef|deleteRef) yet \(HAL-3245\)\./u;
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
    `These cases are listed in notOnGitYet but failed for another reason than the git.vcs-commits refusal:\n${realFailures.join("\n")}`,
  );
});

vcsContract("git", gitVcsHarness(scratch, sharedRunner, plantedHooks));
