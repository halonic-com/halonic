import type { PullRequestState, WorkState } from "@halonicjs/ports";

/** What the Review fact needs: the PR's state, its reviewer's name and how long it has waited. */
export interface ReviewFacts {
  readonly state: PullRequestState;
  readonly reviewer: string | undefined;
  /** "6 h", as the rows write an age. */
  readonly age: string;
}

/**
 * The One PR page's words, as Noah's HAL-17515 `wording` table has them (flow 2, P12–P17). The
 * strings marked "team's call" have no row: the team decided them on HAL-17745 (Julian's review),
 * after patterns Nina already checked.
 */
export const pullRequestDetailWords = {
  /** The back link above the page's title: "‹ Pull requests", "‹ Back" on a phone. */
  back: "Pull requests",
  backSpoken: "Back to Pull requests",
  /** Team's call: the pattern of "This agent or seat is gone.", which Nina checked on HAL-18342. */
  notFound: "This pull request is gone.",
  /** The header's line under the title: "Ravi · task HAL-17451 · 312 lines". */
  task: (label: string) => `task ${label}`,
  lines: (count: number) => (count === 1 ? "1 line" : `${count} lines`),
  stuckSince: (time: string) => `Stuck since ${time}`,
  /** After "Stuck since 07:30" for a fast-track PR waiting for its review. */
  fastTrackDue: "Fast-track review is due within 30 min",
  timeline: "Timeline",
  facts: { review: "Review", queue: "Queue", task: "Task" },
  /** The Queue fact: "1 of 7 · group 1", "Taken out at 12:40", or "Not in the queue". */
  queuePlace: (position: number, total: number, group: number | undefined) =>
    group === undefined ? `${position} of ${total}` : `${position} of ${total} · group ${group}`,
  /** After the place while its group builds: "ci-ok running 9 min". */
  groupRunning: (minutes: number) => `ci-ok running ${minutes} min`,
  takenOutAt: (time: string) => `Taken out at ${time}`,
  notInQueue: "Not in the queue",
  /** The Task fact's state, lower case: "HAL-17451 · in progress · Ravi". Team's call but "in progress". */
  taskState: {
    todo: "to do",
    "in-progress": "in progress",
    "in-review": "in review",
    blocked: "blocked",
    done: "done",
    cancelled: "cancelled",
    other: "",
  } satisfies Record<WorkState, string>,
  readOnly: "Read-only: nothing merges, queues, labels, approves, closes or reruns from here.",
};

/**
 * The Review fact (P12–P17): who was asked and how long ago, who approved, or that nobody was asked
 * yet, with why for a failing PR. "Approved on 9c1d0e2" waits for the port's approved head. A
 * reviewer in any other state (changes requested, failing, conflicting) is named alone, since the
 * port doesn't say whether they approved.
 */
export function reviewFact({ state, reviewer, age }: ReviewFacts): string {
  if (reviewer === undefined) {
    return state === "failing" ? "Not asked yet (needs a green ci-ok first)" : "Not asked yet";
  }
  if (state === "waiting-for-review") return `${reviewer} · asked ${age} ago`;
  if (state === "approved" || state === "in-queue") {
    return `Approved by ${reviewer} on the current head`;
  }
  // Only approved PRs enter the queue, so one taken out of it was approved.
  if (state === "dequeued") return `Approved by ${reviewer}`;
  return reviewer;
}
