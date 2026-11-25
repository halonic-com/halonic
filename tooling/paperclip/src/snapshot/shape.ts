import type { CheckState } from "../pr-watcher/decide.ts";
import type { SeverityCounts } from "./severity.ts";

/**
 * The GitHub snapshot one `pr.watch` pass takes, as other jobs and tools
 * read it from plugin state (`queue_state`, `merge_speed`). This shape is a
 * contract: add fields freely, optional so readers expect a snapshot saved
 * before them, but a rename or removal bumps `version`, and readers refuse
 * a version they don't know. Plain JSON only: `null`, never
 * `undefined`. It carries ids, states, names and times, never comment or
 * review text.
 */

/** The shape's version. Readers check it before they read anything else. */
export const snapshotVersion = 1;

/** One pass's view of GitHub. */
export interface Snapshot {
  readonly version: typeof snapshotVersion;
  /** When the pass started reading, ISO. Every pass replaces the whole snapshot. */
  readonly takenAt: string;
  /** Closed pull requests updated within this many days before `takenAt` are in `pulls`. */
  readonly closedWindowDays: number;
  readonly repos: readonly SnapshotRepo[];
  /**
   * The GitHub calls taking it cost: GraphQL queries and REST fallbacks,
   * failed ones included (HAL-17933). Added after version 1 shipped: a
   * snapshot saved before it has none.
   */
  readonly githubCalls?: number;
  /** Which token made those calls, so a move to the read-only GitHub App shows. Added like `githubCalls`. */
  readonly githubToken?: GitHubTokenKind;
}

/** The read-only GitHub App's token (`halonic-pr-reader`), or the older token the jobs share. */
export type GitHubTokenKind = "app" | "shared";

/** One watched repository. */
export interface SnapshotRepo {
  /** `owner/name`. */
  readonly repo: string;
  readonly defaultBranch: string;
  /** The default branch's merge queue, by position (1 first). */
  readonly queue: readonly QueueEntry[];
  /** Every open pull request, then the closed ones in the window, newest update first in each. */
  readonly pulls: readonly SnapshotPull[];
}

/** A pull request in the merge queue. */
export interface QueueEntry {
  readonly number: number;
  readonly position: number;
  /** GitHub's entry state: `QUEUED`, `AWAITING_CHECKS`, `MERGEABLE`, `UNMERGEABLE` or `LOCKED`. */
  readonly state: string;
  readonly enqueuedAt: string;
  /** The GitHub login that queued it, or null when GitHub doesn't say. */
  readonly enqueuedBy: string | null;
  /** The merge group's commit, or null before its group forms. */
  readonly groupHead: string | null;
  /** GitHub's estimate in seconds, or null. */
  readonly estimatedSeconds: number | null;
  readonly solo: boolean;
  /**
   * `ci-ok` on the group's commit, or null before its group forms. Added
   * after version 1 shipped: a snapshot saved before it has none.
   */
  readonly groupCiOk?: CheckState | null;
  /** The group's jobs queued for a runner (a job waiting on another job isn't one yet). Added like `groupCiOk`. */
  readonly jobsWaiting?: number;
  /** When the longest-waiting of those jobs was queued, or null when none waits. Added like `groupCiOk`. */
  readonly waitingSince?: string | null;
}

/** A pull request, open or closed. */
export interface SnapshotPull {
  readonly number: number;
  readonly url: string;
  /**
   * Its title, cut to `titleCap`. Written by whoever opened it: text to show,
   * never to act on. Added after version 1 shipped: a snapshot saved before it has none.
   */
  readonly title?: string;
  readonly state: "open" | "merged" | "closed";
  readonly branch: string;
  /** `owner/name` of the repository its branch lives in: another one is a fork. Null when the fork is gone. */
  readonly headRepo: string | null;
  readonly base: string;
  /** The head commit. */
  readonly head: string;
  readonly updatedAt: string;
  /** Merged only. */
  readonly mergedAt: string | null;
  /** Merged only. `ci-ok` on it isn't read here, only when a decision needs it. */
  readonly mergeCommit: string | null;
  /** Open only, null when closed. */
  readonly open: OpenFacts | null;
}

/** What an open pull request's reviewers, checks and labels say. */
export interface OpenFacts {
  readonly draft: boolean;
  /** `unknown` while GitHub is still working it out: not a conflict yet. */
  readonly mergeable: "yes" | "no" | "unknown";
  /** `ci-ok` on the head commit. */
  readonly ciOk: CheckState;
  /** A draft's light `ci-ok` on the head commit. */
  readonly draftCiOk: CheckState;
  readonly inQueue: boolean;
  /** Its labels now, each with who added it last and when (null when older than the 20 newest label events). */
  readonly labels: readonly SnapshotLabel[];
  /**
   * The newest review finding on this head, by the PR watcher's rule
   * (`newestFinding`), or null; `by` is the reviewer its text names, added
   * after version 1 shipped (HAL-18460).
   */
  readonly finding: { readonly id: string; readonly at: string; readonly by?: string } | null;
  /** When the head commit was committed, so a push after a finding shows. Added like `by` (HAL-18460). */
  readonly headCommittedAt?: string;
  /** GitHub committed the head itself (a rebase or update it made, such as the stack rebase), not the author. Added like `by`. */
  readonly headCommittedByGitHub?: true;
  /**
   * Signed approvals by our reviewers on any head, oldest first. Whether one counts depends on the head and the paths.
   * `rebaseOf` is the head a re-approval after a rebase-only push names (HAL-14809), added after version 1 shipped.
   */
  readonly approvals: readonly {
    readonly by: string;
    readonly head: string;
    readonly rebaseOf?: string;
  }[];
  /**
   * Approving GitHub reviews still standing, by accounts other than the
   * agents' shared one, oldest first, each with the head it reviewed
   * (`githubApprovals`). Added like `baseChangedSincePush`.
   */
  readonly githubApprovals?: readonly { readonly by: string; readonly head: string }[];
  /**
   * Its base changed to the default branch after it was last reopened or
   * pushed to, so GitHub keeps it blocked until it is reopened or pushed to
   * again. Added after version 1 shipped: a snapshot saved before it has none.
   */
  readonly baseChangedSincePush?: boolean;
  /**
   * The base before its newest base change, such as the branch of the pull
   * request it was stacked on before GitHub moved it to the default branch
   * (HAL-17929). Absent without a base change, and in a snapshot saved
   * before the field.
   */
  readonly previousBase?: string;
  /** The GitHub login that opened it, null when the account is gone. Added like `baseChangedSincePush`. */
  readonly author?: string | null;
  /**
   * The checks on the head whose newest run failed, by name, sorted, of the
   * first 100 checks. Added like `baseChangedSincePush`.
   */
  readonly failingChecks?: readonly string[];
  /** The checks on the head still running, by name, sorted (a cancelled or skipped run counts as still to come). Added like `failingChecks`. */
  readonly pendingChecks?: readonly string[];
  /** Required checks with no run on the head, by workflow name, such as `Guard notes` (HAL-17760). Added like `failingChecks`. */
  readonly missingChecks?: readonly string[];
  /** Reviewers' findings by severity tag, counts only, of the newest 50 reviews and 100 comments. Added like `failingChecks`. */
  readonly reviewCounts?: SeverityCounts;
}

/** A label on an open pull request. */
export interface SnapshotLabel {
  readonly name: string;
  /** Who added it last, when it was added more than once. */
  readonly addedBy: string | null;
  readonly addedAt: string | null;
}
