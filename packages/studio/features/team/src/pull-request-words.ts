import type { PullRequestState } from "@halonicjs/ports";

/** What a state word needs besides the PR: its age in words, and for a PR in the queue its place. */
export interface StateFacts {
  /** "2 d", "3 h", "20 min". */
  readonly age: string;
  /** When it entered this state as a clock time, "14:20". */
  readonly time: string;
  readonly reviewer: string | undefined;
  readonly reason: string | undefined;
  readonly queue: { readonly position: number; readonly total: number } | undefined;
  /** Whole minutes its merge group has been building, when it's in one. */
  readonly groupMinutes: number | undefined;
}

/**
 * A state's words in two parts: the chip's symbol and word ("✕ Failing: typecheck"), then the
 * muted detail after it ("2 h"). A row shows them as "✕ Failing: typecheck · 2 h".
 */
export interface StateWords {
  /** Empty for a state with no chip, such as one a provider can't map. */
  readonly chip: string;
  readonly detail: string | undefined;
}

/** "Waiting for review · Liam", or the word alone with no reviewer yet. */
const withReviewer = (word: string, facts: StateFacts) =>
  facts.reviewer === undefined ? word : `${word} · ${facts.reviewer}`;

/** "In the queue · 3 of 7", with "group running 9 min" after it while its group builds. */
function inQueue(facts: StateFacts): StateWords {
  const place =
    facts.queue === undefined ? "" : ` · ${facts.queue.position} of ${facts.queue.total}`;
  return {
    chip: `≡ In the queue${place}`,
    detail:
      facts.groupMinutes === undefined ? undefined : `group running ${facts.groupMinutes} min`,
  };
}

/** "✕ Failing: typecheck", or the word alone when the cause has no words. */
const withReason = (word: string, facts: StateFacts) =>
  facts.reason === undefined ? word : `${word}: ${facts.reason}`;

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
  /** The freshness slot's warning, and the sentence in the Callout under the tabs (P7). */
  oldAsOf: (asOf: string) => `⚠ ${asOf}`,
  oldSnapshot: (asOf: string) => `${asOf}. The PR watcher may have stopped.`,
  tabs: { attention: "Needs attention", open: "All open" },
  /** The name of the list switcher (a11y check TM4). */
  listsLabel: "Pull request lists",
  stuck: "Stuck",
  worstFirst: "worst first",
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
    draft: (facts) => ({ chip: "○ Draft", detail: facts.age }),
    "waiting-for-review": (facts) => ({
      chip: withReviewer("◔ Waiting for review", facts),
      detail: facts.age,
    }),
    "changes-requested": (facts) => ({
      chip: withReviewer("↩ Changes requested", facts),
      detail: facts.age,
    }),
    // HAL-17515 has "Approved on abc1234", but the port carries no approved head yet.
    approved: () => ({ chip: "✓ Approved", detail: "waiting for the queue" }),
    "approval-outdated": () => ({
      chip: "⚠ Approved on an older head",
      detail: "pushed after approval",
    }),
    "in-queue": inQueue,
    failing: (facts) => ({ chip: withReason("✕ Failing", facts), detail: facts.age }),
    conflicting: (facts) => ({ chip: "✕ Conflicts with main", detail: facts.age }),
    dequeued: (facts) => ({ chip: withReason("⊘ Taken out", facts), detail: facts.age }),
    merged: (facts) => ({ chip: `Merged ${facts.time}`, detail: undefined }),
    // Closed PRs aren't on any list.
    closed: () => ({ chip: "", detail: undefined }),
    other: (facts) => ({ chip: "", detail: facts.age }),
  } satisfies Record<PullRequestState, (facts: StateFacts) => StateWords>,
};

/** An age as the rows write it: "20 min" under an hour, "3 h" under a day, then "2 d". */
export function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}
