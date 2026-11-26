/**
 * The PR watcher's done and wake rules as a signal rule (HAL-17980, on the
 * HAL-17772 design): from a compact snapshot of the watched tasks, their
 * pull requests and what the watcher told them before, the actions of one
 * pass. It is a ToolScript rule (ADR 2026-11-24-toolscript, P1 to P7): JSON
 * in, an action list out, no imports, no I/O, and time only from
 * `input.now`, so it moves into a ToolScript Action unchanged and a backtest
 * replays it exactly. It gives the same outcome as `pr-watcher/decide.ts`,
 * which a parity test holds it to until the watcher runs on it.
 */

/** A `ci-ok` result. `missing` means GitHub has no such check (yet). */
export type CheckState = "success" | "failure" | "pending" | "missing";

/** Why a holder is woken: one state of one pull request. */
export type WakeKind =
  | "ci-red"
  | "conflict"
  | "retargeted"
  | "review"
  | "approved"
  | "merged"
  | "held"
  | "required-failed";

/** What the rule reads about one pull request. */
export interface WatchedPull {
  /** `owner/name#123`. */
  readonly pr: string;
  readonly state: "open" | "merged" | "closed";
  readonly head: string;
  /** Open only: `ci-ok` on the head. */
  readonly ciOkOnHead: CheckState;
  readonly draft: boolean;
  /** Open only: GitHub says it can't merge into its base. */
  readonly conflicting: boolean;
  readonly inQueue: boolean;
  /** Open only: its base changed after its last reopen or push. */
  readonly retargeted: boolean;
  /** Open only: the newest review or inline comment on the head. */
  readonly latestReview: { readonly id: string; readonly at: string } | null;
  /** Open only: an approving GitHub review on the head where the base branch needs one. */
  readonly githubApproved: boolean;
  /** Open only: merge control holds this head after its merge group failed. */
  readonly held: boolean;
  /** Open only: required workflows besides CI whose newest run on the head failed; absent in older inputs. */
  readonly requiredFailed?: readonly string[];
  /** Merged only: `ci-ok` passed on the merge commit, or a later base-branch commit is green. */
  readonly landed: boolean;
  readonly mergedAt: string | null;
}

/** What the rule reads about one task. */
export interface WatchedTask {
  /** The task's identifier, such as `HAL-42`. */
  readonly task: string;
  /** The agent that holds the task. */
  readonly holder: string | null;
  /** The agent every one of its pull requests' branches names; null for none or several. */
  readonly owner: string | null;
  /** A run of its holder is queued or running. */
  readonly running: boolean;
  /** It has a child task that isn't done or cancelled. */
  readonly openChildren: boolean;
  /** It is in `backlog` or `blocked`. */
  readonly parked: boolean;
  /** What the watcher told the task before, read back from the comments. */
  readonly memory: {
    readonly reported: readonly string[];
    readonly seenUntil: string | null;
    /** When the holder last wrote the hold line, in their newest comment. */
    readonly heldAt: string | null;
    readonly lastCommentAt: string | null;
  };
  readonly pulls: readonly WatchedPull[];
}

/** The rule's settings, from the signal file or the defaults. */
export interface PrWatcherSettings {
  readonly done: boolean;
  readonly wakeOn: readonly WakeKind[];
}

/** One pass's input. */
export interface PrWatcherInput {
  readonly now: string;
  readonly settings: PrWatcherSettings;
  readonly tasks: readonly WatchedTask[];
}

/** Wake the task's holder for one new state of one pull request. `key` is the watcher's marker. */
export interface WakeAction {
  readonly kind: "wake";
  readonly key: string;
  readonly task: string;
  readonly pr: string;
  readonly head: string;
  readonly reason: WakeKind;
}

/** Mark the task done: its pull requests merged and landed. */
export interface DoneAction {
  readonly kind: "task-update";
  readonly key: string;
  readonly task: string;
  readonly status: "done";
  readonly pulls: readonly string[];
}

/** One thing a pass does. */
export type PrWatcherAction = WakeAction | DoneAction;

interface Reason {
  readonly pull: WatchedPull;
  readonly kind: WakeKind;
  readonly key: string;
}

function at(pull: WatchedPull): string {
  return `${pull.pr} ${pull.head.slice(0, 7)}`;
}

function openReasons(pull: WatchedPull): Reason[] {
  const free = !pull.inQueue && !pull.draft;
  const found: [boolean, WakeKind, string][] = [
    [pull.ciOkOnHead === "failure", "ci-red", "ci-red"],
    [pull.conflicting && free, "conflict", "conflict"],
    [pull.retargeted && free, "retargeted", "retargeted"],
    ...(pull.requiredFailed ?? []).map((workflow): [boolean, WakeKind, string] => [
      !pull.draft,
      "required-failed",
      `${workflow} failed`,
    ]),
    [pull.latestReview !== null, "review", `review ${pull.latestReview?.id}`],
    [pull.held, "held", "held"],
    [pull.githubApproved && free, "approved", "approved on GitHub"],
  ];
  return found
    .filter(([when]) => when)
    .map(([, kind, what]) => ({ pull, kind, key: `${at(pull)} ${what}` }));
}

function candidates(pulls: readonly WatchedPull[]): Reason[] {
  return pulls.filter((pull) => pull.state === "open").flatMap(openReasons);
}

function newReasons(found: readonly Reason[], memory: WatchedTask["memory"]): Reason[] {
  const seenUntil = memory.seenUntil === null ? Number.NaN : Date.parse(memory.seenUntil);
  return found.filter((reason) => {
    if (memory.reported.includes(reason.key)) {
      return false;
    }
    const review = reason.pull.latestReview;
    return !(reason.kind === "review" && review !== null && Date.parse(review.at) <= seenUntil);
  });
}

/** The newest merged pull request, or null. */
function newestMerge(pulls: readonly WatchedPull[]): WatchedPull | null {
  return pulls.reduce<WatchedPull | null>(
    (last, pull) =>
      pull.mergedAt !== null && (last === null || `${pull.mergedAt}` > `${last.mergedAt}`)
        ? pull
        : last,
    null,
  );
}

/** Every pull request closed, at least one merged, and every merged one landed. */
function allLanded(pulls: readonly WatchedPull[]): readonly WatchedPull[] | null {
  const merged = pulls.filter((pull) => pull.state === "merged");
  const open = pulls.some((pull) => pull.state === "open");
  return open || merged.length === 0 || merged.some((pull) => !pull.landed) ? null : merged;
}

/**
 * Done, unless the holder wrote the hold line after the last merge, a child
 * task is open, or someone commented after the merge, which wakes the holder
 * once (never on a parked task).
 */
function doneOrWake(task: WatchedTask, merged: readonly WatchedPull[]): Reason[] | "done" | null {
  const newest = newestMerge(merged);
  const mergedAt = newest?.mergedAt ?? null;
  const { heldAt, lastCommentAt, reported } = task.memory;
  if (heldAt !== null && (mergedAt === null || Date.parse(heldAt) > Date.parse(mergedAt))) {
    return null;
  }
  if (task.openChildren) {
    return null;
  }
  if (newest === null || mergedAt === null || lastCommentAt === null) {
    return "done";
  }
  if (!(Date.parse(lastCommentAt) > Date.parse(mergedAt))) {
    return "done";
  }
  const key = `${at(newest)} merged`;
  return task.parked || reported.includes(key) ? null : [{ pull: newest, kind: "merged", key }];
}

/** The states that wake the holder of an open task, or of a parked one. */
function openWakes(task: WatchedTask): Reason[] {
  const found = candidates(task.pulls).filter(
    (reason) => !task.parked || reason.kind === "retargeted" || reason.kind === "held",
  );
  return newReasons(found, task.memory);
}

function actionsOf(task: WatchedTask, settings: PrWatcherSettings): PrWatcherAction[] {
  if (task.owner === null || task.holder !== task.owner || task.running) {
    return [];
  }
  const merged = allLanded(task.pulls);
  const outcome = merged === null ? null : doneOrWake(task, merged);
  if (outcome === "done") {
    const pulls = (merged ?? []).map((pull) => pull.pr);
    const key = `${task.task}|${pulls.join(",")}|done`;
    return settings.done
      ? [{ kind: "task-update", key, task: task.task, status: "done", pulls }]
      : [];
  }
  const closed = task.pulls.every((pull) => pull.state !== "open");
  const reasons = outcome ?? (closed ? [] : openWakes(task));
  return reasons
    .filter((reason) => settings.wakeOn.includes(reason.kind))
    .map(({ pull, kind, key }) => ({
      kind: "wake",
      key,
      task: task.task,
      pr: pull.pr,
      head: pull.head,
      reason: kind,
    }));
}

/**
 * Every action of one pass, per task in input order.
 *
 * @example
 * decide({ now: "2026-11-25T10:00:00Z", settings: { done: true, wakeOn: [] }, tasks: [] }); // []
 */
export function decide(input: PrWatcherInput): PrWatcherAction[] {
  return input.tasks.flatMap((task) => actionsOf(task, input.settings));
}
