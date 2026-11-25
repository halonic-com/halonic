/**
 * What merge control keeps between passes, its settings, and what a pass
 * returns. One versioned plugin state entry replaces the Merger's
 * `state.json`; the board's switches live in it too and are set only by
 * the board.
 */

/** A rerun already sent for a head. */
export interface Rerun {
  readonly head: string;
  readonly at: string;
  readonly run: number;
}

/** A pull request taken out as unmergeable, and the entries that were ahead of it. */
export interface Cooldown {
  readonly head: string;
  readonly ahead: readonly number[];
  readonly at: string;
}

/** The board's switches. */
export interface BoardSwitches {
  /** Pull requests kept out of the queue, with why. Lifted only by the board. */
  readonly hold: Readonly<Record<string, string>>;
  /** Points added to a pull request's fill score; never a jump. */
  readonly prio: Readonly<Record<string, number>>;
  /** Only `waitFor` pull requests are added until each has a green `ci-ok`, or until `until`. */
  readonly fillPause: { readonly until: string; readonly waitFor: readonly number[] } | null;
  /** Main is red: only pull requests whose title or branch match `allowRe` go in, with a jump. */
  readonly mainRed: { readonly since: string; readonly allowRe: string } | null;
}

/**
 * Main is broken: a merge group failed only on files its pull request
 * doesn't touch (HAL-17875). Set once, with the main-red freeze; cleared
 * when the freeze ends.
 */
export interface MainBroken {
  readonly since: string;
  /** The failed group run that showed it. */
  readonly run: string;
  /** The files its failed jobs' annotations name. */
  readonly files: readonly string[];
}

/** Why a head is held: the failed merge group's run, for the PR watcher's wake (HAL-18147). */
export interface HeldRun {
  readonly head: string;
  readonly url: string;
  /** The failed jobs' names; empty when the run named none. */
  readonly jobs: readonly string[];
  /** The first failure annotation's title that says more than an exit code, or null. */
  readonly error: string | null;
}

/** A close and reopen sent for a label-noop head (HAL-18470). */
export interface LabelNoopReopen {
  readonly head: string;
  readonly at: string;
}

/** An approved, green head waiting out of the queue, and since when. */
export interface NotQueued {
  readonly head: string;
  readonly at: string;
}

/** Everything kept between passes, keyed by pull request number. */
export interface MergeState {
  readonly version: 1;
  readonly lastQueue: readonly number[];
  readonly seenFailedRuns: readonly number[];
  readonly unmergeableSince: Readonly<Record<string, string>>;
  readonly cooldown: Readonly<Record<string, Cooldown>>;
  /** Culprit holds: the head that failed in a merge group. */
  readonly failedHeads: Readonly<Record<string, string>>;
  /** The run behind each culprit hold, pruned with it. A state saved before HAL-18147 has none. */
  readonly heldRuns: Readonly<Record<string, HeldRun>>;
  /** Holds lifted for a flake, by head. */
  readonly flakeLifted: Readonly<Record<string, string>>;
  /** The head whose cancelled group was let back in once. */
  readonly autoFlaked: Readonly<Record<string, string>>;
  readonly readySince: Readonly<Record<string, string>>;
  /**
   * Since when each approved, green pull request has waited out of the
   * queue on its head, for the not-queued note (HAL-18735). A state saved
   * before it has none.
   */
  readonly notQueuedSince: Readonly<Record<string, NotQueued>>;
  /** Comments and other once-per-head actions already sent, `<kind>#<number>` to head. */
  readonly noted: Readonly<Record<string, string>>;
  readonly reran: Readonly<Record<string, Rerun>>;
  readonly reranFlake: Readonly<Record<string, Rerun>>;
  /** Label-noop reopens of the last 2 days, oldest first. A state saved before HAL-18470 has none. */
  readonly labelNoopReopened: Readonly<Record<string, readonly LabelNoopReopen[]>>;
  readonly runnerAlertOn: string | null;
  readonly lowWaitSince: string | null;
  /** A lower fill target while runners are short; null is the full target. */
  readonly fillTarget: number | null;
  /** The board set `fillTarget` by hand: don't restore it. */
  readonly tuneManual: boolean;
  /** Not a culprit hold: no pull request is held for it. */
  readonly mainBroken: MainBroken | null;
  readonly board: BoardSwitches;
}

/** The state before the first pass. */
export const emptyMergeState: MergeState = {
  version: 1,
  lastQueue: [],
  seenFailedRuns: [],
  unmergeableSince: {},
  cooldown: {},
  failedHeads: {},
  heldRuns: {},
  flakeLifted: {},
  autoFlaked: {},
  readySince: {},
  notQueuedSince: {},
  noted: {},
  reran: {},
  reranFlake: {},
  labelNoopReopened: {},
  runnerAlertOn: null,
  lowWaitSince: null,
  fillTarget: null,
  tuneManual: false,
  mainBroken: null,
  board: { hold: {}, prio: {}, fillPause: null, mainRed: null },
};

/** The numbers and names the rules use. */
export interface MergeSettings {
  /** The organisation whose branches the queue takes. */
  readonly owner: string;
  /** The shared account every agent posts as: only its texts can be signed approvals. */
  readonly teamLogin: string;
  /**
   * Logins whose `fast-track` label counts (HAL-15971 rule 3). The board's login comes from the
   * plugin's config, never from code (HAL-16851).
   */
  readonly fastTrackLabellers: readonly string[];
  /**
   * Authors whose open pull requests without a `built-on:*` label get
   * `built-on:paperclip` once approved and green (HAL-18506). The board's
   * queue login comes from the plugin's config, never from code (HAL-16851).
   */
  readonly autoLabelAuthors: readonly string[];
  readonly fillTarget: number;
  /** A fast-track pull request jumps only with more than this many entries queued. */
  readonly jumpAhead: number;
  readonly rerunsPerPass: number;
  readonly fileSizeLimit: number;
  /** The runner label merge groups run on, for the capacity check. */
  readonly queueRunnerLabel: string;
  /** Runner-minutes to rebuild one merge group: about 16 jobs of about 15 minutes. */
  readonly groupRunnerMinutes: number;
  /**
   * Push-run jobs on `main` known to fail without a code cause: a push run
   * red only in these ends the main-red freeze (HAL-17912 item D). Each
   * entry goes once its flake is fixed.
   */
  readonly knownFlakyPushJobs: readonly string[];
}

/** Today's settings (board, 22–24 Nov). */
export const defaultSettings: MergeSettings = {
  owner: "halonic-com",
  teamLogin: "halonic-dev",
  fastTrackLabellers: ["halonic-dev"],
  autoLabelAuthors: ["halonic-dev"],
  fillTarget: 15,
  jumpAhead: 8,
  rerunsPerPass: 8,
  fileSizeLimit: 500,
  queueRunnerLabel: "large",
  groupRunnerMinutes: 240,
  // Goes once HAL-18065 fixes the emulator flake.
  knownFlakyPushJobs: ["Android device keys (emulator)"],
};

/** The one label merge control adds, and the write client allows (HAL-18506). */
export const autoLabel = "built-on:paperclip";

/** Why a queued pull request comes out (MERGER.md §4, a–e and the board's additions). */
export type RemovalReason =
  | "board-hold"
  | "foreign"
  | "conflict"
  | "unmergeable"
  | "change-request"
  | "head-moved"
  | "no-signed-approval";

/** What a jump or dequeue throws away: the merge groups it cancels and their runner-minutes. */
export interface ActionCost {
  readonly groupsCancelled: number;
  readonly runnerMinutes: number;
}

/**
 * One write for the action layer, the only kinds there are. `wake` and
 * `update-branch` aren't decided yet: the PR watcher's task rules and the
 * proactive rebase move into this core in later pull requests (ADR).
 */
export type MergeAction =
  | {
      readonly kind: "enqueue";
      readonly number: number;
      readonly pullId: string;
      readonly head: string;
      readonly jump: boolean;
      /** Zero unless it jumps. */
      readonly cost: ActionCost;
    }
  | {
      readonly kind: "dequeue";
      readonly number: number;
      readonly pullId: string;
      readonly head: string;
      /** `group-failed`: its own merge group failed, taken out at once (HAL-18506). */
      readonly reason: RemovalReason | "group-failed";
      /**
       * Posted after the dequeue; for a conflict also when GitHub already took
       * it out. Empty when the culprit hold posts its own comment.
       */
      readonly comment: string;
      readonly cost: ActionCost;
    }
  | {
      readonly kind: "update-branch";
      readonly number: number;
      readonly pullId: string;
      /** The head it rebases, so a stale action fails instead of moving a newer head. */
      readonly head: string;
      readonly why: string;
    }
  | {
      readonly kind: "wake";
      /** The agent to wake, by name. */
      readonly agent: string;
      /** The task to wake them on, such as `HAL-42`. */
      readonly task: string;
      /** Once per event and head, like the comment keys. */
      readonly key: string;
      /** What happened, for the wake comment. */
      readonly facts: readonly string[];
    }
  | {
      readonly kind: "reopen";
      readonly number: number;
      readonly pullId: string;
      readonly head: string;
      /** Posted before the close. */
      readonly comment: string;
    }
  | {
      /** Adds `built-on:paperclip` to an approved, green pull request without one (HAL-18506). */
      readonly kind: "add-label";
      readonly number: number;
      readonly head: string;
      readonly label: typeof autoLabel;
      /** `auto-label#<number>@<head>`, like a comment's key. */
      readonly key: string;
      /** Posted after the label. */
      readonly comment: string;
    }
  | { readonly kind: "rerun"; readonly runId: number; readonly why: string }
  | { readonly kind: "rerun-failed-jobs"; readonly runId: number; readonly why: string }
  | { readonly kind: "cancel-run"; readonly runId: number; readonly why: string }
  | {
      readonly kind: "comment";
      readonly number: number;
      readonly key: string;
      readonly body: string;
    };

/** One line of the pass log; `rule` says which rule wrote it. */
export interface LogLine {
  readonly rule: string;
  readonly text: string;
}

/** What one pass decided. */
export interface Decision {
  readonly actions: readonly MergeAction[];
  readonly state: MergeState;
  readonly log: readonly LogLine[];
}
