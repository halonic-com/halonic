import type { ManifestChange } from "../reviewer-paths.ts";
import type { PrioTask } from "../rules/queue-prio.ts";

/**
 * What one merge-control pass knows about GitHub and Paperclip, read before
 * `decide` runs. Only facts: every rule that turns them into a verdict lives
 * in `decide` and its rule modules, so a test or a replay can feed a
 * recorded snapshot. Times are ISO strings, as GitHub gives them.
 */

/** A merge-queue entry's state, as GitHub's GraphQL API names it. */
export type QueueEntryState = "QUEUED" | "AWAITING_CHECKS" | "MERGEABLE" | "UNMERGEABLE" | "LOCKED";

/** One entry of the merge queue on `main`. */
export interface QueueEntry {
  readonly number: number;
  readonly position: number;
  readonly state: QueueEntryState;
  readonly enqueuedAt: string;
  /** The merge group's commit, or null before GitHub forms it. */
  readonly groupHead: string | null;
}

/** A comment or review on a pull request. */
export interface PullText {
  readonly kind: "comment" | "review";
  /** The GitHub login that posted it. */
  readonly by: string;
  readonly at: string;
  readonly body: string;
  /** Reviews only: `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`. */
  readonly reviewState?: string;
  /** Reviews only: the commit it was submitted on. */
  readonly commit?: string;
}

/** One check run on a pull request's head commit. */
export interface CheckFact {
  readonly name: string;
  /** The workflow that ran it, such as `CI` or `Guard notes`. */
  readonly workflow: string;
  /** The workflow run's event, such as `pull_request`. */
  readonly event: string;
  readonly status: "queued" | "in_progress" | "completed";
  /** Lower case, such as `success`; null until it completes. */
  readonly conclusion: string | null;
  /** When its workflow run was created: GitHub decides by the newest run, not the newest attempt. */
  readonly runCreatedAt: string;
  readonly startedAt: string | null;
  readonly url: string;
}

/** A failed job in a workflow run, with the names of its failed steps. */
export interface FailedJob {
  readonly id: number;
  readonly name: string;
  readonly url: string;
  readonly failedSteps: readonly string[];
  /**
   * The paths its `failure` annotations name, `.github` left out; read only
   * for a merge group's failed jobs, and missing when not read.
   */
  readonly annotatedFiles?: readonly string[];
  /**
   * The titles of its `failure` annotations; read only for a merge group's
   * failed jobs, and missing when not read or when the read failed.
   */
  readonly annotationTitles?: readonly string[];
}

/** What a known-flake check reads about the run whose `ci-ok` failed on the head. */
export interface CiOkRun {
  readonly runId: number;
  readonly headSha: string;
  readonly ciOkJobId: number;
  /** The `ci-ok` job's log, or empty when it couldn't be read. */
  readonly ciOkLog: string;
  readonly failedJobs: readonly FailedJob[];
}

/** One open pull request the gate looks at: queued, or labelled `built-on:paperclip` or `built-on:halonic`. */
export interface GatePull {
  readonly number: number;
  /** GraphQL node id, for the queue mutations. */
  readonly id: string;
  readonly title: string;
  readonly branch: string;
  readonly base: string;
  readonly head: string;
  readonly createdAt: string;
  readonly draft: boolean;
  readonly labels: readonly string[];
  readonly crossRepository: boolean;
  /** The login owning the head repository, or null when the fork is gone. */
  readonly headOwner: string | null;
  readonly additions: number;
  readonly deletions: number;
  readonly mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  readonly mergeStateStatus: string;
  /** Up to the first 100 changed paths. */
  readonly files: readonly string[];
  readonly filesTotal: number;
  /** Additions minus deletions per changed file, files not removed only. */
  readonly fileNet: Readonly<Record<string, number>>;
  /** Each changed package `package.json` at merge base and head, for Julian's scope. */
  readonly manifests: Readonly<Record<string, ManifestChange>> | undefined;
  readonly headCommittedAt: string;
  readonly forcePushedAt: readonly string[];
  /** Base changes, by hand or automatic after the lower pull request merged. */
  readonly retargetedAt: readonly string[];
  /**
   * The newest merge-queue event when it is a removal: when, and GitHub's
   * reason in upper case, such as `FAILED_CHECKS`. Null when the newest is
   * an add, or there is none.
   */
  readonly queueExit: { readonly at: string; readonly reason: string } | null;
  readonly texts: readonly PullText[];
  /** Check runs on the head, every workflow and event. */
  readonly checks: readonly CheckFact[];
  /** The `live-cloud` check runs on the head, or null when they couldn't be read. */
  readonly liveCloud: readonly CheckFact[] | null;
  /** The newest `pull_request` CI run on the head, or null when there is none. */
  readonly ciRun: {
    readonly id: number;
    readonly status: string;
    readonly createdAt: string;
  } | null;
  /** Who last added `fast-track`; null when GitHub doesn't say. */
  readonly fastTrackBy: string | null;
  /** Read only for a red `ci-ok` on a `fast-track` pull request. */
  readonly ciOkRun: CiOkRun | null;
}

/** A completed `CI` run of a merge group. */
export interface GroupRun {
  readonly id: number;
  readonly conclusion: string;
  /** `gh-readonly-queue/main/pr-<number>-<sha>`. */
  readonly branch: string;
  readonly url: string;
  readonly createdAt: string;
  /** Failed jobs other than `ci-ok`; a cancelled run can hide a failure. */
  readonly failedJobs: readonly FailedJob[];
}

/** A workflow run, as the stall and stale-run rules need it. */
export interface RunFact {
  readonly id: number;
  readonly headSha: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly createdAt: string;
  readonly branch: string;
}

/** A `CI` push run on `main`. */
export interface MainRun extends RunFact {
  /**
   * The names of its jobs that didn't pass or get skipped; read only for the
   * newest completed, not cancelled run that didn't pass, missing otherwise.
   */
  readonly redJobs?: readonly string[];
}

/** Runner capacity, from the CI live metrics and the CI server's status file; null where unreadable. */
export interface RunnerCapacity {
  /** Free merge-queue (large) runner slots. */
  readonly freeQueueSlots: number | null;
  /** Jobs waiting for a runner, by runner label; a missing label has none waiting. */
  readonly waitingByLabel: Readonly<Record<string, number>> | null;
  /** Merge groups cancelled in the last hour. */
  readonly cancelledGroupsLastHour: number | null;
}

/** Everything one pass reads. */
export interface MergeSnapshot {
  readonly takenAt: string;
  readonly queue: readonly QueueEntry[];
  /** Queued pull requests and open `built-on:paperclip` or `built-on:halonic` ones. */
  readonly pulls: readonly GatePull[];
  /**
   * Every open pull request: stacks for the fill order, heads for stale runs
   * and for pruning the state. Null when the list couldn't be read (a
   * replayed pass): nothing is pruned then.
   */
  readonly open:
    | readonly {
        readonly number: number;
        readonly branch: string;
        readonly base: string;
        readonly head: string;
      }[]
    | null;
  /** Pull requests merged lately, to report the ones that left the queue that way. */
  readonly merged: readonly { readonly number: number; readonly mergedAt: string }[];
  /** Paperclip tasks for the fill order. */
  readonly tasks: readonly PrioTask[];
  /** Line counts on `main` of the files ready pull requests grow (see `mainFileOf`). */
  readonly mainFiles: Readonly<
    Record<string, { readonly lines: number; readonly barrel: boolean }>
  >;
  /** A fingerprint of `merge-base..sha`'s changes, by sha (`facts-patch-ids.ts`); null when it couldn't be worked out. */
  readonly patchIds: Readonly<Record<string, string | null>>;
  /** Completed merge-group `CI` runs of the last 3 hours. */
  readonly groupRuns: readonly GroupRun[];
  /** Merge-group runs of the last 24 hours, every workflow and status. */
  readonly mergeGroupRuns: readonly RunFact[];
  /** Queued `pull_request` runs. */
  readonly queuedPullRuns: readonly RunFact[];
  /** The longest wait of a queued merge-group job for a runner, in minutes; null when unreadable. */
  readonly runnerWaitMinutes: number | null;
  /** Null when the reader couldn't read it at all; counts as short. */
  readonly capacity: RunnerCapacity | null;
  /** Newest `CI` push runs on `main`. */
  readonly mainRuns: readonly MainRun[];
}
