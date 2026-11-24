import type { PullRequest, WorkState } from "@halonicjs/ports";

/** Why a pull request is stuck, one per rule of Sofia's six (HAL-17510, section 2). */
export type StuckReason =
  | "failing"
  | "conflicting"
  | "review-overdue"
  | "taken-out"
  | "approval-outdated"
  | "queue-overdue"
  | "task-stalled";

/** What the screen knows about the task a pull request's branch names, from `AgentMessaging`'s work. */
export interface StuckTask {
  readonly state: WorkState;
  /** Whether a task it's blocked by is already done. */
  readonly blockedByDone: boolean;
}

const minuteMs = 60 * 1000;

/** How long each state may last before it counts as stuck. Team rules: Liam may change them. */
export const stuckAfterMinutes = {
  failing: 60,
  conflicting: 60,
  review: 4 * 60,
  fastTrackReview: 30,
  takenOut: 60,
  queue: 90,
} as const;

/**
 * Why a pull request is stuck now (requirement `team.pull-request-stuck`), from
 * Sofia's six rules: failing or conflicting for more than an hour; waiting
 * for review for more than 4 hours, or 30 minutes with Fast-track; taken
 * out of the queue for more than an hour; approved on an older head; in the
 * queue for more than 90 minutes; its task done while the PR is open, or
 * blocked by a task that's done. Empty when it isn't stuck. The hours are
 * team rules, so they live here and not in the port.
 */
export function stuckReasons(
  pullRequest: PullRequest,
  now: Date,
  task?: StuckTask,
): readonly StuckReason[] {
  const minutes = (now.getTime() - Date.parse(pullRequest.since)) / minuteMs;
  const reasons: StuckReason[] = [];
  const stateReason = stateRule(pullRequest, minutes);
  if (stateReason !== undefined) reasons.push(stateReason);
  if (task !== undefined && isStalled(task)) reasons.push("task-stalled");
  return reasons;
}

function stateRule(pullRequest: PullRequest, minutes: number): StuckReason | undefined {
  switch (pullRequest.state) {
    case "failing":
      return minutes > stuckAfterMinutes.failing ? "failing" : undefined;
    case "conflicting":
      return minutes > stuckAfterMinutes.conflicting ? "conflicting" : undefined;
    case "waiting-for-review": {
      const limit = pullRequest.fastTrack
        ? stuckAfterMinutes.fastTrackReview
        : stuckAfterMinutes.review;
      return minutes > limit ? "review-overdue" : undefined;
    }
    case "dequeued":
      return minutes > stuckAfterMinutes.takenOut ? "taken-out" : undefined;
    case "approval-outdated":
      return "approval-outdated";
    case "in-queue":
      return minutes > stuckAfterMinutes.queue ? "queue-overdue" : undefined;
    default:
      return undefined;
  }
}

/** A task that's done or cancelled under an open PR, or that waits on a task that's done. */
function isStalled(task: StuckTask): boolean {
  if (task.state === "done" || task.state === "cancelled") return true;
  return task.state === "blocked" && task.blockedByDone;
}
