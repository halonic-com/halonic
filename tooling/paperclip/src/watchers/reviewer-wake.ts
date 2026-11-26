import { fastTrackLabel } from "../pr-tools/queue-state.ts";
import { snapshotReviewer } from "../snapshot/reviewers.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";

/**
 * The reviewer wake (HAL-17938): an open pull request that waits only for its
 * reviewer wakes that reviewer on their chat task, once per head: the
 * reviewer the snapshot names (`snapshotReviewer`, the shared answer of
 * HAL-19639 since HAL-19653), so a routine one wakes Nora. It reads only the
 * pass's snapshot. Chief's
 * answers on HAL-17940: the wake comes after 60 minutes on the same head, 30
 * for a `fast-track` one (its review time). HAL-17722's `review_nudge` covers
 * fast-track pull requests too, but only logs, so it wakes nobody yet.
 */

/** How long a head waits for its reviewer before the wake. */
export const reviewerWakeMinutes = 60;
/** The same for a `fast-track` pull request. */
export const fastTrackWakeMinutes = 30;

/** A reviewer by the name their signed line writes, such as `Nora`. */
export type Reviewer = string;

/** What the wake keeps between passes, per company, by `owner/name#123`. */
export interface ReviewerWakeState {
  readonly version: 1;
  /** Since when each pull request waits for its reviewer on this head. */
  readonly waiting: Readonly<Record<string, { readonly head: string; readonly since: string }>>;
  /** The head each pull request last woke its reviewer for. */
  readonly woken: Readonly<Record<string, string>>;
}

export const emptyReviewerWake: ReviewerWakeState = { version: 1, waiting: {}, woken: {} };

/** A pull request in a wake. */
export interface WaitingPull {
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly head: string;
  readonly minutes: number;
}

/** One wake: one reviewer, every pull request due for them in this pass. */
export interface ReviewerWake {
  readonly reviewer: Reviewer;
  readonly pulls: readonly WaitingPull[];
}

/** Who the wake goes to: the reviewer the snapshot names. */
export function wakeReviewerOf(pull: SnapshotPull): Reviewer {
  return snapshotReviewer(pull);
}

/**
 * Out of draft, `ci-ok` green on its head, mergeable, not in the merge queue,
 * and no signed approval on its head: only its reviewer can move it.
 */
export function waitsOnlyForReviewer(pull: SnapshotPull): boolean {
  const open = pull.open;
  return (
    pull.state === "open" &&
    open !== null &&
    !open.draft &&
    open.ciOk === "success" &&
    open.mergeable === "yes" &&
    !open.inQueue &&
    !open.approvals.some(({ head }) => pull.head.startsWith(head))
  );
}

function wakeAfterMinutes(pull: SnapshotPull): number {
  return pull.open?.labels.some(({ name }) => name === fastTrackLabel)
    ? fastTrackWakeMinutes
    : reviewerWakeMinutes;
}

/**
 * The wakes due in this pass, at most one per reviewer, and the state to
 * save. Only `repo` counts (`halonic`: cloud's approval is a GitHub review),
 * and only branches in it, not forks. A repository the snapshot didn't read
 * keeps what it had.
 */
export function reviewerWakePass(
  snapshot: Snapshot,
  repo: string,
  before: ReviewerWakeState,
  now: Date,
): { readonly wakes: readonly ReviewerWake[]; readonly state: ReviewerWakeState } {
  const read = snapshot.repos.find((listed) => listed.repo === repo);
  if (read === undefined) {
    return { wakes: [], state: before };
  }
  const waiting: Record<string, { head: string; since: string }> = {};
  const woken: Record<string, string> = {};
  const due = new Map<Reviewer, WaitingPull[]>();
  for (const pull of read.pulls) {
    if (pull.state !== "open" || pull.headRepo?.toLowerCase() !== repo.toLowerCase()) {
      continue;
    }
    const key = `${repo}#${pull.number}`;
    const last = before.woken[key];
    if (last !== undefined) {
      woken[key] = last;
    }
    if (!waitsOnlyForReviewer(pull)) {
      continue;
    }
    const was = before.waiting[key];
    const since = was?.head === pull.head ? was.since : now.toISOString();
    waiting[key] = { head: pull.head, since };
    const minutes = Math.floor((now.getTime() - Date.parse(since)) / 60_000);
    if (minutes >= wakeAfterMinutes(pull) && last !== pull.head) {
      const reviewer = wakeReviewerOf(pull);
      const list = due.get(reviewer) ?? [];
      list.push({ repo, number: pull.number, url: pull.url, head: pull.head, minutes });
      due.set(reviewer, list);
      woken[key] = pull.head;
    }
  }
  const wakes = [...due].map(([reviewer, pulls]) => ({
    reviewer,
    pulls: pulls.sort((a, b) => b.minutes - a.minutes || a.number - b.number),
  }));
  return { wakes, state: { version: 1, waiting, woken } };
}

/** The wake's comment on the reviewer's chat task. */
export function reviewerWakeText(wake: ReviewerWake): string {
  const lines = wake.pulls.map(
    (pull) =>
      `- [#${pull.number}](${pull.url}), head \`${pull.head.slice(0, 7)}\`, waiting ${pull.minutes} min`,
  );
  const count =
    wake.pulls.length === 1 ? "1 pull request waits" : `${wake.pulls.length} pull requests wait`;
  return [
    `Reviewer wake: ${count} only for your review (out of draft, \`ci-ok\` green, mergeable, not queued, no signed approval on the head), oldest first:`,
    ...lines,
  ].join("\n");
}
