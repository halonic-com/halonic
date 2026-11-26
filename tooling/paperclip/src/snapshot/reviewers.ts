import { branchOwner } from "../pr-watcher/decide.ts";
import { reviewerName, reviewerOf } from "../reviewer-paths-who.ts";
import type { Snapshot, SnapshotPull, SnapshotRepo } from "./shape.ts";

/**
 * Each open pull request's reviewer in the pass's snapshot (HAL-19653), so
 * the tools that read only the snapshot (the reviewer wake, the fast-track
 * rules) name who the PR watcher and `pr_status` name: the shared answer
 * (`reviewerAnswer`, HAL-19639). Reading it costs about 4 GitHub requests,
 * so it is read only for a pull request out of draft on the watcher's first
 * repository, from a branch in it, and kept per head between passes: a pass
 * reads it again only after a push.
 */

/** What the pass keeps between passes: each pull request's reviewer and the head it was read on, by `owner/name#123`. */
export interface ReviewerCache {
  readonly version: 1;
  readonly pulls: Readonly<Record<string, { readonly head: string; readonly reviewer: string }>>;
}

export const emptyReviewerCache: ReviewerCache = { version: 1, pulls: {} };

/** The shared answer for one pull request: its reviewer's url key, and the head it was read on. */
export type ReviewerRead = (
  repo: string,
  number: number,
) => Promise<{ readonly head: string; readonly reviewer: string }>;

/**
 * The reviewer by the author rule alone, where the paths weren't read: the
 * code reviewer, or the second reviewer on a pull request the code reviewer
 * wrote (`reviewerOf`), as their signed line writes the name.
 */
export function authorRuleReviewer(pull: Pick<SnapshotPull, "branch">): string {
  return reviewerName(reviewerOf(branchOwner(pull.branch), ["liam"]));
}

/** The reviewer the snapshot names, or the author rule's for a snapshot saved before the field. */
export function snapshotReviewer(pull: SnapshotPull): string {
  return pull.open?.reviewer ?? authorRuleReviewer(pull);
}

/** What `withReviewers` needs from the pass. */
export interface ReviewerOptions {
  /** The repository whose paths are read: the watcher's first (`halonic`). */
  readonly repo: string;
  readonly before: ReviewerCache;
  readonly read: ReviewerRead;
  readonly log: (line: string) => void;
}

function readsPaths(repo: string, pull: SnapshotPull): boolean {
  return (
    pull.open !== null && !pull.open.draft && pull.headRepo?.toLowerCase() === repo.toLowerCase()
  );
}

/**
 * The snapshot with `reviewer` on every open pull request, and the cache to
 * keep. A pull request whose answer can't be read gets the author rule's
 * reviewer and is read again in the next pass; a failure never fails the pass.
 */
export async function withReviewers(
  snapshot: Snapshot,
  options: ReviewerOptions,
): Promise<{ readonly snapshot: Snapshot; readonly cache: ReviewerCache }> {
  const pulls: Record<string, { head: string; reviewer: string }> = {};
  const reviewerOfPull = async (repo: string, pull: SnapshotPull): Promise<string> => {
    if (repo !== options.repo || !readsPaths(repo, pull)) {
      return authorRuleReviewer(pull);
    }
    const key = `${repo}#${pull.number}`;
    const kept = options.before.pulls[key];
    if (kept?.head === pull.head) {
      pulls[key] = kept;
      return kept.reviewer;
    }
    try {
      const answer = await options.read(repo, pull.number);
      const reviewer = reviewerName(answer.reviewer);
      pulls[key] = { head: answer.head, reviewer };
      return reviewer;
    } catch (error) {
      options.log(`Reviewer of ${key}: couldn't read it: ${(error as Error).message}`);
      return authorRuleReviewer(pull);
    }
  };
  const repos: SnapshotRepo[] = [];
  for (const repo of snapshot.repos) {
    const withReviewer: SnapshotPull[] = [];
    for (const pull of repo.pulls) {
      withReviewer.push(
        pull.open === null
          ? pull
          : { ...pull, open: { ...pull.open, reviewer: await reviewerOfPull(repo.repo, pull) } },
      );
    }
    repos.push({ ...repo, pulls: withReviewer });
  }
  return { snapshot: { ...snapshot, repos }, cache: { version: 1, pulls } };
}
