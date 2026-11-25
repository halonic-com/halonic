/**
 * The fast-track lifecycle rule (HAL-17774): from a compact snapshot of the
 * labelled pull requests and their lifecycle runs, the actions of one pass.
 * It is a ToolScript rule (ADR 2026-11-24-toolscript, P1 to P7): JSON in,
 * an action list out, no imports, no I/O, and time only from `input.now`,
 * so it moves into a ToolScript Action unchanged and a backtest replays it
 * exactly. The plugin's pass sends each `stage` action into the pull
 * request's run as the event `stage`, and hands every other action to the
 * executor of its kind.
 */

/** A lifecycle stage: the workflow's state of the same name (`review_late` counts as `review`). */
export type Stage = "ready" | "review" | "approved" | "queued" | "merged" | "closed";

/** The pull request's lifecycle run, as its summary says. */
export interface LifecycleRun {
  /** The run's state, such as `review_late`; null before its first state. */
  readonly state: string | null;
  /** `waiting` while it lives; `completed` once it merged or closed; `failed` after an interruption. */
  readonly status: string;
  /** When it entered its current wait, ISO; null when it never waited. */
  readonly since: string | null;
}

/** What the rule reads about one pull request. */
export interface LifecyclePull {
  /** `owner/name#123`. */
  readonly pr: string;
  readonly task: string | null;
  readonly head: string;
  /** Whose approval counts: Liam, or Julian on a pull request Liam wrote. */
  readonly reviewer: string;
  readonly state: "open" | "merged" | "closed";
  readonly labelled: boolean;
  readonly draft: boolean;
  readonly checksRunning: boolean;
  /** The failing checks worth a nudge, on this head. */
  readonly failing: readonly string[];
  readonly approvedOnHead: boolean;
  /** `ci-ok` green with nothing failing or running that counts. */
  readonly green: boolean;
  /** Its base is the default branch, so it may enter the merge queue. */
  readonly onDefaultBranch: boolean;
  readonly inQueue: boolean;
  /** Null while it has no lifecycle run. */
  readonly run: LifecycleRun | null;
}

/** One pass's input: the time it took the snapshot, and the pull requests. */
export interface LifecycleInput {
  readonly now: string;
  readonly pulls: readonly LifecyclePull[];
}

/** Says when two actions are the same one: task, pull request, head and what. */
interface Keyed {
  readonly key: string;
  readonly pr: string;
  readonly task: string | null;
  readonly head: string;
}

/** Move the pull request's run to `stage`, starting a run when it has none that lives. */
export interface StageAction extends Keyed {
  readonly kind: "stage";
  readonly stage: Stage;
}

/** Put the pull request in the merge queue, without a jump. */
export interface EnqueueAction extends Keyed {
  readonly kind: "enqueue";
}

/** Run the named failed checks again. */
export interface RerunAction extends Keyed {
  readonly kind: "rerun";
  readonly checks: readonly string[];
}

/** Say something on the task, or to the board. */
export interface CommentAction extends Keyed {
  readonly kind: "comment";
  readonly to: "task" | "board";
  readonly text: string;
}

/** Change the task: its status, or what blocks it. */
export interface TaskUpdateAction extends Keyed {
  readonly kind: "task-update";
  readonly status: string;
}

/** One thing a pass does. */
export type LifecycleAction =
  | StageAction
  | EnqueueAction
  | RerunAction
  | CommentAction
  | TaskUpdateAction;

/** Approved and green this long before it is queued, as the phase 1 rules had it. */
export const enqueueAfterMinutes = 10;

/** The stage the snapshot shows. */
export function stageOf(pull: LifecyclePull): Stage {
  if (pull.state === "merged") {
    return "merged";
  }
  if (pull.state === "closed" || !pull.labelled) {
    return "closed";
  }
  if (pull.inQueue) {
    return "queued";
  }
  if (pull.draft) {
    return "ready";
  }
  if (pull.approvedOnHead) {
    return "approved";
  }
  return pull.checksRunning ? "ready" : "review";
}

/** The stage a run is in; null when it has no state that lives. */
function runStage(run: LifecycleRun | null): string | null {
  if (run === null || run.status === "failed" || run.state === null) {
    return null;
  }
  return run.state === "review_late" ? "review" : run.state;
}

function keyed(pull: LifecyclePull, what: string): Keyed {
  return {
    key: `${pull.task ?? "-"}|${pull.pr}|${pull.head}|${what}`,
    pr: pull.pr,
    task: pull.task,
    head: pull.head,
  };
}

function stageActions(pull: LifecyclePull, stage: Stage): LifecycleAction[] {
  const current = runStage(pull.run);
  const ended = stage === "merged" || stage === "closed";
  // A pull request never seen open with the label needs no run to end.
  if (current === stage || (current === null && ended && pull.run === null)) {
    return [];
  }
  return [{ ...keyed(pull, `stage:${stage}`), kind: "stage", stage }];
}

function minutesSince(at: string | null, now: string): number {
  return at === null ? 0 : (Date.parse(now) - Date.parse(at)) / 60_000;
}

function reviewActions(pull: LifecyclePull, stage: Stage): LifecycleAction[] {
  if (stage !== "review") {
    return [];
  }
  const short = pull.head.slice(0, 7);
  const actions: LifecycleAction[] = [
    {
      ...keyed(pull, "comment:review_nudge"),
      kind: "comment",
      to: "task",
      text: `${pull.reviewer}, please review now: fast-track, ready for review and not approved on head ${short}.`,
    },
  ];
  if (pull.run?.state === "review_late") {
    actions.push({
      ...keyed(pull, "comment:review_escalate"),
      kind: "comment",
      to: "board",
      text: `still not approved on head ${short} 15 min after it was ready for review: ${pull.reviewer} hasn't reviewed it.`,
    });
  }
  return actions;
}

function checkActions(pull: LifecyclePull, stage: Stage): LifecycleAction[] {
  if (pull.draft || stage === "merged" || stage === "closed") {
    return [];
  }
  const short = pull.head.slice(0, 7);
  return pull.failing.map((name) => ({
    ...keyed(pull, `comment:check_fail:${name}`),
    kind: "comment",
    to: "task",
    text: `\`${name}\` failed on head ${short}: the author fixes it, or says on the task that a fix is on its way.`,
  }));
}

function enqueueActions(pull: LifecyclePull, stage: Stage, now: string): LifecycleAction[] {
  const waited = runStage(pull.run) === "approved" ? minutesSince(pull.run?.since ?? null, now) : 0;
  if (
    stage !== "approved" ||
    !pull.green ||
    !pull.onDefaultBranch ||
    waited < enqueueAfterMinutes
  ) {
    return [];
  }
  return [{ ...keyed(pull, "enqueue"), kind: "enqueue" }];
}

/**
 * Every action of one pass, per pull request in input order: its stage
 * first, then what to say and what to queue.
 *
 * @example
 * decide({ now: "2026-11-25T10:00:00Z", pulls: [] }); // []
 */
export function decide(input: LifecycleInput): LifecycleAction[] {
  return input.pulls.flatMap((pull) => {
    const stage = stageOf(pull);
    return [
      ...stageActions(pull, stage),
      ...reviewActions(pull, stage),
      ...checkActions(pull, stage),
      ...enqueueActions(pull, stage, input.now),
    ];
  });
}
