import { judgeApprovals } from "../pr-tools/approvals.ts";
import { branchOwner, type Memory, marker, type PullFacts, short } from "./decide.ts";
import type { Reviewer, SinceApproval } from "./handoff.ts";

/**
 * An approval that carries over a rebase (HAL-18460). The Merger counts an
 * approval of an older head on the current one when `git patch-id` of both
 * diffs from `main` is the same (`paperclip.merge-control-carry-over`), so a
 * pull request that was only rebased needs no new review round. The watcher
 * used to hand those back to a reviewer anyway; now it records the carry-over
 * on the task once per head and leaves the task with its author. It posts no
 * approval: the Merger's own patch-id check decides, and any changed line
 * still goes to the reviewer. Rules only, no I/O, like `handoff.ts`.
 */

/** The repositories whose merge queue the Merger runs, and so carries approvals over a rebase. */
export const carryRepos: ReadonlySet<string> = new Set(["halonic-com/halonic"]);

/** One pull request whose approval carries to its current head. */
export interface Carried {
  readonly pull: PullFacts;
  readonly since: SinceApproval;
  /** The key of the push-after-approval warning it replaces. */
  readonly pushedKey: string;
}

/** The key of a recorded carry-over: once per head. */
export function carryKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} carried`;
}

/** The watcher recorded that an approval carries to this head. */
export function carriedOnHead(pull: PullFacts, memory: Memory): boolean {
  return memory.reported.has(carryKey(pull));
}

/**
 * Only a rebase since the approval, and the approval would count on the
 * current head by the HAL-14809 rules: Liam's on any path, Julian's within
 * his limits. Never a security pull request by its paths, which keeps its
 * own gate (HAL-17901); never Liam's own, whose second reviewer's approval
 * needs its "Author: Liam" line on the head it names; and never a stacked
 * one rebased off its merged base, whose approved diff from `main` still
 * holds the base's commits, so `git patch-id` differs at the Merger.
 */
export function carries(pull: PullFacts, since: SinceApproval, byPaths: Reviewer): boolean {
  const author = branchOwner(pull.branch);
  if (!carryRepos.has(pull.repo) || !since.rebaseOnly || since.security === true) {
    return false;
  }
  if (since.stacked === true || author === "liam") {
    return false;
  }
  const [judged] = judgeApprovals([{ by: since.by, head: pull.head }], {
    head: pull.head,
    author,
    reviewer: byPaths,
  });
  return judged?.counts === true;
}

/** The task comment that records the carry-over and wakes nobody. */
export function carriedMessage(carried: readonly Carried[]): string {
  const lines = carried.map(
    ({ pull, since }) =>
      `- [#${pull.number}](${pull.url}): ${since.by} approved \`${short(since.approvedHead)}\`; \`${short(pull.head)}\` has the same changes.`,
  );
  return [
    "PR watcher: only a rebase since the approval, so no new review round.",
    "",
    ...lines,
    "",
    "The Merger carries the approval to the new head when `git patch-id` of both diffs matches, and the queue session picks the pull request up once `ci-ok` is green. Don't send it for re-review. A push that changes a line still needs a review.",
    ...carried.flatMap(({ pull, pushedKey }) => [marker(carryKey(pull)), marker(pushedKey)]),
  ].join("\n");
}
