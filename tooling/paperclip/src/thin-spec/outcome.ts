import type { CheckState } from "../pr-watcher/decide.ts";
import { asksForChanges, byReviewer } from "../pr-watcher/github.ts";

/**
 * What happened to a task the thin-spec check scored, once its pull requests
 * closed (HAL-17355): merged on the first try, or only after rework. Read
 * next to the check's scores, it shows whether a high score predicts rework
 * (HAL-17077). Pure: the plugin reads GitHub and passes the lists in.
 */

/** Why a pull request counts as reworked. */
export type ReworkReason = "changes_requested" | "red_ci_ok" | "reopened";

/** A task's outcome: `not_merged` when every pull request closed without merging. */
export type OutcomeResult = "first_try" | "rework" | "not_merged";

/** One item of a pull request's timeline, as the REST API lists it. */
export interface TimelineItem {
  readonly event?: string;
  /** A review's state, lower case in the timeline (`changes_requested`). */
  readonly state?: string;
  readonly body?: string | null;
  readonly author_association?: string;
  /** A `committed` item's commit. */
  readonly sha?: string;
}

/** The commits pushed to a pull request before its final head, oldest first. */
export function earlierCommits(timeline: readonly TimelineItem[], head: string): string[] {
  return timeline
    .filter((item) => item.event === "committed" && typeof item.sha === "string")
    .map((item) => item.sha as string)
    .filter((sha) => sha !== head);
}

/** A review or conversation comment by a reviewer that asks for changes (the PR watcher's rule). */
function asksReviewerForChanges(item: TimelineItem): boolean {
  if (!byReviewer(item)) {
    return false;
  }
  if (item.event === "reviewed") {
    return item.state === "changes_requested" || asksForChanges(item.body ?? "");
  }
  return item.event === "commented" && asksForChanges(item.body ?? "");
}

/**
 * Why one pull request needed rework, from its timeline and `ci-ok` on each
 * commit before its final head. A red `ci-ok` there was fixed by a later
 * push; a cancelled run isn't red (`newestCheck`).
 */
export function reworkReasons(
  timeline: readonly TimelineItem[],
  earlierCiOk: readonly CheckState[],
): ReworkReason[] {
  const reasons: ReworkReason[] = [];
  if (timeline.some(asksReviewerForChanges)) {
    reasons.push("changes_requested");
  }
  if (earlierCiOk.includes("failure")) {
    reasons.push("red_ci_ok");
  }
  if (timeline.some((item) => item.event === "reopened")) {
    reasons.push("reopened");
  }
  return reasons;
}

/** A task's outcome from its closed pull requests: whether any merged, and every rework reason found. */
export function taskOutcome(merged: boolean, reasons: readonly ReworkReason[]): OutcomeResult {
  if (!merged) {
    return "not_merged";
  }
  return reasons.length === 0 ? "first_try" : "rework";
}
