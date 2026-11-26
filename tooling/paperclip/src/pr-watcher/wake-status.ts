import {
  type CopyReader,
  type CopySource,
  readCopySource,
  withCopies,
} from "../pr-tools/approval-copy.ts";
import { judgeApprovals } from "../pr-tools/approvals.ts";
import { headFactsText } from "../pr-tools/pr-status.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import { branchOwner } from "./decide.ts";
import { pullKey } from "./facts.ts";

/**
 * What `pr_status` would say about an open pull request, from the pass's
 * snapshot, so the wake comment carries it and the woken author doesn't read
 * GitHub again (HAL-17293). No request: the watcher has just read all of it.
 */

/** The `pr_status` head lines of an open pull request, or none when it isn't open. */
export type PullSummary = (pull: { readonly repo: string; readonly number: number }) => string[];

/**
 * Each approved open pull request's Paperclip copies (HAL-19324), by `pullKey`:
 * undefined when its branch names no task. Only pull requests with a signed
 * approval on their head are read. One that couldn't be read is left out and
 * logged, so its wake lines show no copy rather than a wrong one.
 */
export type SnapshotCopies = ReadonlyMap<string, CopySource | undefined>;

/** Reads the copies of the snapshot's approved open pull requests. */
export async function snapshotCopies(
  snapshot: Snapshot,
  reader: CopyReader,
  log: (line: string) => void,
): Promise<SnapshotCopies> {
  const copies = new Map<string, CopySource | undefined>();
  for (const { repo, pulls } of snapshot.repos) {
    for (const pull of pulls) {
      const approved = pull.open?.approvals.some(({ head }) => pull.head.startsWith(head));
      if (approved !== true) {
        continue;
      }
      const ours = pull.headRepo?.toLowerCase() === repo.toLowerCase();
      try {
        copies.set(
          pullKey({ repo, number: pull.number }),
          await readCopySource(reader, ours ? pull.branch : undefined),
        );
      } catch (error) {
        log(
          `PR watcher: couldn't read the approval copies of #${pull.number}: ${(error as Error).message}`,
        );
      }
    }
  }
  return copies;
}

/** Summaries from one pass's snapshot, with the approvals' Paperclip copies when they were read. */
export function snapshotSummary(snapshot: Snapshot, copies?: SnapshotCopies): PullSummary {
  const pulls = new Map(
    snapshot.repos.flatMap(({ repo, pulls: list }) =>
      list.map((pull) => [pullKey({ repo, number: pull.number }), pull] as const),
    ),
  );
  return (ref) => {
    const pull = pulls.get(pullKey(ref));
    const open = pull?.open;
    if (pull === undefined || open === null || open === undefined) {
      return [];
    }
    const judged = judgeApprovals(open.approvals, {
      head: pull.head,
      author: branchOwner(pull.branch),
      reviewer: undefined,
    });
    const key = pullKey(ref);
    return headFactsText({
      head: pull.head,
      // While it's a draft, `pr_status` reports the light run's `ci-ok`.
      ciOk: open.draft ? open.draftCiOk : open.ciOk,
      mergeable: open.mergeable === "no" ? "conflict" : open.mergeable,
      inQueue: open.inQueue,
      // The snapshot holds no changed files, so Julian's limits stay unchecked.
      approvals:
        copies?.has(key) === true ? withCopies(judged, copies.get(key), pull.head) : judged,
      // A snapshot saved before the field was added has none.
      failingChecks: open.failingChecks ?? [],
    });
  };
}
