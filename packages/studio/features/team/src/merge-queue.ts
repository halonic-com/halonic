import type { MergeGroup, MergeQueue, MessagingId, PullRequest } from "@halonicjs/ports";
import type { PullRequestRow } from "./pull-requests.ts";

/** A PR the queue session took out today, with the reason it wrote and when. */
export interface TakenOut {
  readonly pullRequest: PullRequest;
  readonly at: string;
  /** Plain text, as the queue session wrote it. */
  readonly reason: string;
}

/** One merge group as the Queue tab shows it, its PRs as rows. */
export interface QueueGroup {
  readonly position: number;
  readonly state: MergeGroup["state"];
  readonly since: string;
  readonly rows: readonly PullRequestRow[];
  /** For a failed group: the PR the queue session took out of it, when it named one. */
  readonly culprit: TakenOut | undefined;
  /** For a failed group: how many PRs in the groups behind it are tested again. */
  readonly behind: number;
}

/**
 * One repo's merge queue as the Pull requests screen shows it (requirement
 * `team.merge-queue`): its health, the groups in order, the PRs waiting to
 * enter and those taken out today, each PR found among the list's rows.
 */
export interface QueueView {
  readonly health: MergeQueue["health"];
  readonly runnerWaitMinutes: number | undefined;
  readonly medianMinutesToMerge: number | undefined;
  /** Every PR in a group or waiting to enter. */
  readonly total: number;
  /** The first group still building, as "group 2 of 3". */
  readonly building: { readonly number: number; readonly of: number } | undefined;
  readonly groups: readonly QueueGroup[];
  readonly waiting: readonly PullRequestRow[];
  /** Newest first. */
  readonly takenOut: readonly TakenOut[];
}

/**
 * The queue with its PRs looked up in `rows` (the open PRs) and `recent` (merged or closed in the
 * last day). A PR the lists don't have is counted but has no row: the screen never invents one.
 */
export function queueView(
  queue: MergeQueue,
  rows: readonly PullRequestRow[],
  recent: readonly PullRequest[],
): QueueView {
  const rowsOf = (ids: readonly MessagingId[]) =>
    ids.flatMap((id) => rows.filter((row) => row.pullRequest.id === id));
  const known = [...rows.map((row) => row.pullRequest), ...recent];
  const takenOut = queue.removedToday
    .flatMap((removed) => {
      const pullRequest = known.find((each) => each.id === removed.pullRequest);
      return pullRequest === undefined ? [] : [{ ...removed, pullRequest }];
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const ordered = [...queue.groups].sort((a, b) => a.position - b.position);
  const groups = ordered.map((group, index) => ({
    position: group.position,
    state: group.state,
    since: group.since,
    rows: rowsOf(group.pullRequests),
    culprit: group.state === "failed" ? culpritOf(group, takenOut) : undefined,
    behind: ordered.slice(index + 1).reduce((count, each) => count + each.pullRequests.length, 0),
  }));
  const buildingIndex = ordered.findIndex((group) => group.state === "building");
  return {
    health: queue.health,
    runnerWaitMinutes: queue.runnerWaitMinutes,
    medianMinutesToMerge: queue.medianMinutesToMerge,
    total: ordered.reduce(
      (count, group) => count + group.pullRequests.length,
      queue.waiting.length,
    ),
    building: buildingIndex < 0 ? undefined : { number: buildingIndex + 1, of: ordered.length },
    groups,
    waiting: rowsOf(queue.waiting),
    takenOut,
  };
}

/** The group's PR the queue session took out, which it names as the cause. */
function culpritOf(group: MergeGroup, takenOut: readonly TakenOut[]): TakenOut | undefined {
  return takenOut.find((each) => group.pullRequests.includes(each.pullRequest.id));
}
