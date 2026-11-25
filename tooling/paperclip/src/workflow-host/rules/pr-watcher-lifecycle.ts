/**
 * The PR watcher's lifecycle rule (HAL-18197): from each watched pull
 * request's state, whether the `pr-watcher` signal rule marks its task done
 * this pass, and its lifecycle run, the stage to send into that run. It is
 * a ToolScript rule (ADR 2026-11-24-toolscript, P1 to P7): JSON in, an
 * action list out, no imports, no I/O and no clock, so it moves into a
 * ToolScript Action unchanged. The plugin's pass sends each action into the
 * pull request's run as the event `stage`.
 */

/** A stage: the `pr-watcher` workflow's state of the same name. */
export type PrStage = "open" | "merged" | "green" | "done" | "closed";

/** The pull request's lifecycle run, as its summary says. */
export interface PrRun {
  /** The run's state, such as `merged`; null before its first state. */
  readonly state: string | null;
  /** `waiting` while it lives; `completed` once done or closed; `failed` after an interruption. */
  readonly status: string;
}

/** What the rule reads about one watched pull request. */
export interface PrLifecyclePull {
  /** `owner/name#123`. */
  readonly pr: string;
  /** The task its branch names, such as `HAL-42`. */
  readonly task: string;
  readonly state: "open" | "merged" | "closed";
  /** Merged only: `ci-ok` passed on the merge commit, or a later base-branch commit is green. */
  readonly landed: boolean;
  /** The signal rule marks its task done this pass, with this pull request among its pulls. */
  readonly done: boolean;
  /** Null while it has no lifecycle run. */
  readonly run: PrRun | null;
}

/** One pass's input. */
export interface PrLifecycleInput {
  readonly pulls: readonly PrLifecyclePull[];
}

/** Move the pull request's run to `stage`, starting a run when it has none that lives. */
export interface PrStageAction {
  readonly kind: "stage";
  /** Task, pull request and stage. */
  readonly key: string;
  readonly pr: string;
  readonly task: string;
  readonly stage: PrStage;
}

/** The order of the stages: a run never moves back. */
const order: Readonly<Record<PrStage, number>> = {
  open: 0,
  merged: 1,
  green: 2,
  done: 3,
  closed: 3,
};

/** The stage the pass shows. */
export function stageOf(pull: PrLifecyclePull): PrStage {
  if (pull.state === "closed") {
    return "closed";
  }
  if (pull.state === "open") {
    return "open";
  }
  if (pull.done) {
    return "done";
  }
  return pull.landed ? "green" : "merged";
}

/** The stage a run is in; null when it has no state that lives. */
function runStage(run: PrRun | null): PrStage | null {
  if (run === null || run.status === "failed" || run.state === null) {
    return null;
  }
  return run.state in order ? (run.state as PrStage) : null;
}

function actionOf(pull: PrLifecyclePull): PrStageAction[] {
  const stage = stageOf(pull);
  const current = runStage(pull.run);
  // A pull request first seen at its end needs no run only to end it; nor does one whose ended run was forgotten.
  if (current === null && order[stage] === order.done) {
    return [];
  }
  if (current !== null && order[stage] <= order[current]) {
    return [];
  }
  return [
    { kind: "stage", key: `${pull.task}|${pull.pr}|${stage}`, pr: pull.pr, task: pull.task, stage },
  ];
}

/**
 * Every stage to send this pass, in input order.
 *
 * @example
 * decide({ pulls: [] }); // []
 */
export function decide(input: PrLifecycleInput): PrStageAction[] {
  return input.pulls.flatMap(actionOf);
}
