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

/** Summaries from one pass's snapshot. */
export function snapshotSummary(snapshot: Snapshot): PullSummary {
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
    return headFactsText({
      head: pull.head,
      // While it's a draft, `pr_status` reports the light run's `ci-ok`.
      ciOk: open.draft ? open.draftCiOk : open.ciOk,
      mergeable: open.mergeable === "no" ? "conflict" : open.mergeable,
      inQueue: open.inQueue,
      // The snapshot holds no changed files, so Julian's limits stay unchecked.
      approvals: judgeApprovals(open.approvals, {
        head: pull.head,
        author: branchOwner(pull.branch),
        reviewer: undefined,
      }),
      // A snapshot saved before the field was added has none.
      failingChecks: open.failingChecks ?? [],
    });
  };
}
