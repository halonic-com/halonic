import type {
  CommentAction,
  EnqueueAction,
  LifecycleAction,
  RerunAction,
  TaskUpdateAction,
} from "./rules/fast-track-lifecycle.ts";

/**
 * The side effects of the lifecycle rule's actions (HAL-17774), one
 * executor per kind, kept apart from the rule so each kind maps one to one
 * onto a ToolScript capability later (`github.enqueue-pr@1`,
 * `github.rerun-checks@1`, `paperclip.comment@1`, `paperclip.update-task@1`;
 * Liam, HAL-17772). Each is idempotent on the action's key (task, pull
 * request, head and what): the pass skips a key already carried out.
 *
 * This is the dry run: every executor only logs what it would do. Nothing
 * here reads a token. When the enqueue executor goes live it is the only
 * place that reads the merge-queue write token.
 */

/** The actions with a side effect: every kind but `stage`, which the pass sends into the run. */
export type EffectAction = Exclude<LifecycleAction, { kind: "stage" }>;

type ExecutorOf<A> = (action: A) => Promise<string>;

/** One executor per kind; each returns the log line of what it did. */
export interface Executors {
  readonly enqueue: ExecutorOf<EnqueueAction>;
  readonly rerun: ExecutorOf<RerunAction>;
  readonly comment: ExecutorOf<CommentAction>;
  readonly "task-update": ExecutorOf<TaskUpdateAction>;
}

function dryRunLine(action: EffectAction, what: string): string {
  return `Fast-track lifecycle (dry run) ${action.task ?? action.pr}: would ${what} (${action.key}).`;
}

/** The dry-run executors: they log and change nothing. */
export const dryRunExecutors: Executors = {
  enqueue: async (action) => dryRunLine(action, `queue ${action.pr} without a jump`),
  rerun: async (action) =>
    dryRunLine(action, `run ${action.checks.join(", ")} again on ${action.pr}`),
  comment: async (action) =>
    dryRunLine(
      action,
      `say to ${action.to === "board" ? "the board" : "the task"}: ${action.text}`,
    ),
  "task-update": async (action) => dryRunLine(action, `set the task to ${action.status}`),
};

/** Carries out one action with the executor of its kind. */
export function execute(executors: Executors, action: EffectAction): Promise<string> {
  switch (action.kind) {
    case "enqueue":
      return executors.enqueue(action);
    case "rerun":
      return executors.rerun(action);
    case "comment":
      return executors.comment(action);
    case "task-update":
      return executors["task-update"](action);
  }
}
