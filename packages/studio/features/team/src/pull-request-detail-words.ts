import type { PullRequestState } from "@halonicjs/ports";

/** What the Review fact needs: the PR's state, its reviewer's name and how long it has waited. */
export interface ReviewFacts {
  readonly state: PullRequestState;
  readonly reviewer: string | undefined;
  /** "6 h", as the rows write an age. */
  readonly age: string;
}

/**
 * The One PR page's words, as Noah's HAL-17515 `wording` table has them (flow 2, P12–P17). The
 * strings marked "no row" aren't in the table and wait for Nina's copy check.
 */
export const pullRequestDetailWords = {
  /** The back link above the page's title: "‹ Pull requests", "‹ Back" on a phone. */
  back: "Pull requests",
  backSpoken: "Back to Pull requests",
  /** No row. */
  notFound: "This pull request is gone.",
  /** The header's line under the title: "Ravi · task HAL-17451 · 312 lines". */
  task: (label: string) => `task ${label}`,
  lines: (count: number) => (count === 1 ? "1 line" : `${count} lines`),
  stuckSince: (time: string) => `Stuck since ${time}`,
  timeline: "Timeline",
  facts: { review: "Review", queue: "Queue", task: "Task" },
  /** The Queue fact: "1 of 7 · group 1", "Taken out at 12:40", or "Not in the queue". */
  queuePlace: (position: number, total: number, group: number | undefined) =>
    group === undefined ? `${position} of ${total}` : `${position} of ${total} · group ${group}`,
  takenOutAt: (time: string) => `Taken out at ${time}`,
  notInQueue: "Not in the queue",
  openTask: "Open task ↗",
  readOnly: "Read-only: nothing merges, queues, labels, approves, closes or reruns from here.",
};

/**
 * The Review fact (P12–P17): who was asked and how long ago, who approved, or that nobody was asked
 * yet, with why for a failing PR. "Approved on 9c1d0e2" waits for the port's approved head.
 */
export function reviewFact({ state, reviewer, age }: ReviewFacts): string {
  if (reviewer === undefined) {
    return state === "failing" ? "Not asked yet (needs a green ci-ok first)" : "Not asked yet";
  }
  if (state === "waiting-for-review") return `${reviewer} · asked ${age} ago`;
  if (state === "approved" || state === "in-queue") {
    return `Approved by ${reviewer} on the current head`;
  }
  return reviewer;
}
