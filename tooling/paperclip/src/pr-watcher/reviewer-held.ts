import { branchesOwner } from "./decide.ts";
import type { FoundPulls, PullRef } from "./discover.ts";
import { type TaskRow, waitingRunStatuses } from "./paperclip.ts";

/** Which of a task's pull requests the watcher reads, by who holds the task. */

/** The agent every branch names, by its id, when there is one and Paperclip knows it. */
export function ownerOf(branches: readonly string[], owners: ReadonlyMap<string, string>) {
  const key = branchesOwner(branches);
  return key === undefined ? undefined : owners.get(key);
}

/**
 * The pull requests of a task its reviewer (Liam, Julian or Nora, not its
 * author) holds with no run going: read for the hand-back to the author
 * (HAL-21150) and the review-wait note (HAL-17760).
 */
export function reviewerHeldPulls(
  task: TaskRow,
  found: FoundPulls,
  owners: ReadonlyMap<string, string>,
): readonly PullRef[] {
  const pulls = found.get(task.identifier) ?? [];
  const holder = task.assigneeAgentId;
  const reviewers = [owners.get("liam"), owners.get("julian"), owners.get("nora")];
  const author = ownerOf(
    pulls.map((ref) => ref.branch),
    owners,
  );
  const held = holder !== null && reviewers.includes(holder) && holder !== author;
  return held && !task.running ? pulls : [];
}

/**
 * The same, but a run that is only queued or parked doesn't count: moving a
 * limited reviewer's task cancels it (HAL-19203).
 */
export function reroutablePulls(
  task: TaskRow,
  found: FoundPulls,
  owners: ReadonlyMap<string, string>,
): readonly PullRef[] {
  const working = task.running && !waitingRunStatuses.has(task.runStatus ?? "");
  return working ? [] : reviewerHeldPulls({ ...task, running: false }, found, owners);
}
