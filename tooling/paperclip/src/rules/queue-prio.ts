/**
 * The order in which ready pull requests fill the merge queue on `halonic`
 * (`queue.prio`). Critical path first: a PR that other PRs are stacked on, or
 * whose task blocks other tasks, goes before one that blocks nothing
 * (HAL-14892). Aging keeps a PR that blocks nothing from waiting forever
 * (HAL-14388, 22 Nov).
 *
 * Shared `rules/` code: the Merger calls it on every pass, so there is no
 * hourly `prio.json`. No I/O here; a change counts as a merge-queue change
 * and Liam reviews it.
 */

import { taskOfBranch } from "../pr-watcher/discover.ts";

/** A Paperclip task priority. */
export type TaskPriority = "critical" | "high" | "medium" | "low";

/** The numbers behind the score. */
export interface PrioWeights {
  /** Per open pull request whose base branch is this pull request's branch. */
  readonly perStackedPull: number;
  /** Per open task whose "blocked by" field names this pull request's task. */
  readonly perBlockedTask: number;
  /** What the pull request's own task priority adds. */
  readonly taskPriority: Readonly<Record<TaskPriority, number>>;
  /** Aging adds 1 for each full step of this many hours since the pull request became ready. */
  readonly agingStepHours: number;
  /** Aging adds at most this much. */
  readonly agingMax: number;
}

/** Today's weights: 100 per stacked PR, 10 per blocked task, the task's priority, +1 per 2 h ready up to +24. */
export const prioWeights: PrioWeights = {
  perStackedPull: 100,
  perBlockedTask: 10,
  taskPriority: { critical: 4, high: 3, medium: 2, low: 1 },
  agingStepHours: 2,
  agingMax: 24,
};

/** An open pull request, as `queue.prio` needs it. */
export interface PrioPull {
  readonly number: number;
  /** Its head branch, `<agent>/<task id>-<name>`. */
  readonly branch: string;
  /** The branch it merges into: `main`, or another pull request's branch in a stack. */
  readonly base: string;
  /** When it last became ready (approved, `ci-ok` green on its head), or undefined if it isn't. */
  readonly readySince: string | undefined;
}

/** A Paperclip task, as `queue.prio` needs it. */
export interface PrioTask {
  readonly identifier: string;
  readonly status: string;
  readonly priority: TaskPriority | undefined;
  /** The identifiers in its "blocked by" field. */
  readonly blockedBy: readonly string[];
}

/** One pull request's score, with the parts it is made of. */
export interface RankedPull {
  readonly number: number;
  readonly task: string | undefined;
  readonly readySince: string | undefined;
  readonly score: number;
  readonly parts: {
    readonly stackedPulls: number;
    readonly blockedTasks: number;
    readonly taskPriority: number;
    readonly aging: number;
  };
}

const closedStatuses: ReadonlySet<string> = new Set(["done", "cancelled"]);

/** What aging adds for a pull request ready since `readySince`, at `now`. */
export function agingPoints(
  readySince: string | undefined,
  now: Date,
  weights: PrioWeights = prioWeights,
): number {
  if (readySince === undefined) {
    return 0;
  }
  const hours = (now.getTime() - Date.parse(readySince)) / 3_600_000;
  if (!(hours > 0)) {
    // Not ready yet by this clock, or an unreadable time: no aging.
    return 0;
  }
  return Math.min(weights.agingMax, Math.floor(hours / weights.agingStepHours));
}

/**
 * Scores every pull request in `ranked` and returns them highest first.
 * `open` is every open pull request on the repo, ready or not, because a
 * pull request stacked on another counts even before it is ready itself.
 * Equal scores go oldest ready first, then lowest number.
 */
export function queuePrio(input: {
  readonly ranked: readonly PrioPull[];
  readonly open: readonly PrioPull[];
  readonly tasks: readonly PrioTask[];
  readonly now: Date;
  readonly weights?: PrioWeights;
}): readonly RankedPull[] {
  const weights = input.weights ?? prioWeights;
  const tasksById = new Map(input.tasks.map((task) => [task.identifier.toUpperCase(), task]));
  const blockedCount = countBlockedTasks(input.tasks);

  const scored = input.ranked.map((pull): RankedPull => {
    const task = taskOfBranch(pull.branch);
    const stacked = input.open.filter(
      (other) => other.number !== pull.number && other.base === pull.branch,
    ).length;
    const blocked = task === undefined ? 0 : (blockedCount.get(task) ?? 0);
    const priority = task === undefined ? undefined : tasksById.get(task)?.priority;
    const parts = {
      stackedPulls: stacked * weights.perStackedPull,
      blockedTasks: blocked * weights.perBlockedTask,
      taskPriority: priority === undefined ? 0 : weights.taskPriority[priority],
      aging: agingPoints(pull.readySince, input.now, weights),
    };
    const score = parts.stackedPulls + parts.blockedTasks + parts.taskPriority + parts.aging;
    return { number: pull.number, task, readySince: pull.readySince, score, parts };
  });

  return scored.sort(byPrio);
}

/** For each task identifier, how many open tasks name it in their "blocked by" field. */
function countBlockedTasks(tasks: readonly PrioTask[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (closedStatuses.has(task.status)) {
      continue;
    }
    // A task that names the same blocker twice is still one blocked task.
    for (const blocker of new Set(task.blockedBy.map((id) => id.toUpperCase()))) {
      counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
    }
  }
  return counts;
}

function byPrio(a: RankedPull, b: RankedPull): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  const readyA = readyTime(a);
  const readyB = readyTime(b);
  if (readyA !== readyB) {
    return readyA < readyB ? -1 : 1;
  }
  return a.number - b.number;
}

/** When it became ready, in milliseconds; never ready or unreadable sorts last. */
function readyTime(pull: RankedPull): number {
  const time = pull.readySince === undefined ? Number.NaN : Date.parse(pull.readySince);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
