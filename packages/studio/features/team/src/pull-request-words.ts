import type { PullRequestState } from "@halonicjs/ports";

/** What a state word needs besides the PR: its age in words, and for a PR in the queue its place. */
export interface StateFacts {
  /** "2 d", "3 h", "20 min". */
  readonly age: string;
  readonly reviewer: string | undefined;
  readonly reason: string | undefined;
  readonly queue: { readonly position: number; readonly total: number } | undefined;
  /** Whole minutes its merge group has been building, when it's in one. */
  readonly groupMinutes: number | undefined;
}

/** "Liam · 3 h", or the age alone with no reviewer yet. */
const withReviewer = (facts: StateFacts) =>
  facts.reviewer === undefined ? facts.age : `${facts.reviewer} · ${facts.age}`;

/** "In the queue · 3 of 7", with "group running 9 min" while its group builds. */
function inQueue(facts: StateFacts): string {
  const place =
    facts.queue === undefined ? "" : ` · ${facts.queue.position} of ${facts.queue.total}`;
  const group =
    facts.groupMinutes === undefined ? "" : ` · group running ${facts.groupMinutes} min`;
  return `≡ In the queue${place}${group}`;
}

/**
 * The Pull requests screen's words, as Noah's HAL-17515 `wording` table has
 * them (flow 2, checked by Nina on HAL-17547). Every state has its symbol and
 * its word, never colour alone.
 */
export const pullRequestWords = {
  /** The sidebar place, and the title before a repo is known. */
  place: "Pull requests",
  title: (repo: string) => `Pull requests · ${repo}`,
  loading: "Loading…",
  loadingSpoken: "Loading pull requests",
  offline: (time: string) => `Offline, as of ${time}. Rows stay as they were.`,
  oldSnapshot: (asOf: string) => `⚠ ${asOf}. The PR watcher may have stopped.`,
  tabs: { attention: "Needs attention", open: "All open" },
  /** The name of the list switcher (a11y check TM4). */
  listsLabel: "Pull request lists",
  stuckHeading: "Stuck · worst first",
  comingUp: "Coming up",
  nothingStuck: (open: number) =>
    `Nothing is stuck. ${open === 1 ? "1 PR is" : `${open} PRs are`} open.`,
  seeAllOpen: "See all open",
  noOpen: "No open pull requests.",
  notAvailable: "PR states aren't available yet.",
  noSnapshot:
    "The PR watcher hasn't sent a snapshot to Paperclip, so nothing here could be trusted. GitHub still has every PR.",
  cantRead: "This connection can't read pull requests yet. Connect again to allow it.",
  noTask: "No task found for this branch",
  openInGitHub: "Open in GitHub ↗",
  fastTrack: "⚡ Fast-track",
  /** All open's groups, in the state table's order: failing first, drafts last. */
  groups: [
    ["failing", "Failing"],
    ["conflicting", "Conflicting"],
    ["dequeued", "Taken out of the queue"],
    ["approval-outdated", "Approval out of date"],
    ["changes-requested", "Changes requested"],
    ["waiting-for-review", "Waiting for review"],
    ["approved", "Approved"],
    ["in-queue", "In the queue"],
    ["draft", "Drafts"],
  ] as const satisfies readonly (readonly [PullRequestState, string])[],
  state: {
    draft: (facts) => `○ Draft · ${facts.age}`,
    "waiting-for-review": (facts) => `◔ Waiting for review · ${withReviewer(facts)}`,
    "changes-requested": (facts) => `↩ Changes requested · ${withReviewer(facts)}`,
    // HAL-17515 has "Approved on abc1234", but the port carries no approved head yet.
    approved: () => "✓ Approved · waiting for the queue",
    "approval-outdated": () => "⚠ Approved on an older head · pushed after approval",
    "in-queue": inQueue,
    failing: (facts) =>
      facts.reason === undefined
        ? `✕ Failing · ${facts.age}`
        : `✕ Failing: ${facts.reason} · ${facts.age}`,
    conflicting: (facts) => `✕ Conflicts with main · ${facts.age}`,
    dequeued: (facts) =>
      facts.reason === undefined
        ? `⊘ Taken out · ${facts.age}`
        : `⊘ Taken out: ${facts.reason} · ${facts.age}`,
    // Merged and closed PRs are only in Merged today, which comes with the PR detail.
    merged: () => "",
    closed: () => "",
    other: (facts) => facts.age,
  } satisfies Record<PullRequestState, (facts: StateFacts) => string>,
};

/** An age as the rows write it: "20 min" under an hour, "3 h" under a day, then "2 d". */
export function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}
