import type { Decision, Memory, PullFacts } from "./decide.ts";
import type { TaskRow } from "./paperclip.ts";

/**
 * Extra guards on the watcher's done (HAL-18284): a stacked pull request's
 * task closed after the first merge on HAL-18054. On top of the rules in
 * `decide.ts`, a task stays open when its last merge is older than the
 * window, when the board has a card open on it, or when its description or
 * newest comments say more pull requests follow. Split from `watch.ts` to
 * keep it under the size limit.
 */

/** The `mergeWindowHours` setting's default: only a merge this recent closes a task. */
export const defaultMergeWindowHours = 12;

/** How many of the newest comments the text guard reads. */
export const recentCommentCount = 3;

/** Words that say the task has more pull requests to come. */
const morePullsPattern = /PR 1 of \d+|more PRs|stacked on/i;

/** What the guards need beyond the decision's facts. */
export interface CloseGuards {
  /** Only a task whose last merge is at most this many hours before `now` closes. */
  readonly mergeWindowHours: number;
  /** Whether the task has a card the board hasn't answered; read only for a task about to close. */
  readonly boardCard: (taskId: string) => Promise<boolean>;
}

/** The `mergeWindowHours` setting from the company config, or its default when unset or not a positive number. */
export function mergeWindowOf(config: Readonly<Record<string, unknown>>): number {
  const hours = config["mergeWindowHours"];
  return typeof hours === "number" && hours > 0 ? hours : defaultMergeWindowHours;
}

/** Whether the task's description or one of its newest comments says more pull requests follow. */
export function saysMorePulls(task: TaskRow, memory: Memory): boolean {
  const texts = [task.description ?? "", ...(memory.recentComments ?? [])];
  return texts.some((text) => morePullsPattern.test(text));
}

/** Whether the newest merge is older than the window. */
function mergedTooLongAgo(pulls: readonly PullFacts[], now: Date, hours: number): boolean {
  const merges = pulls.flatMap((pull) => (pull.mergedAt === undefined ? [] : [pull.mergedAt]));
  const newest = Math.max(...merges.map((at) => Date.parse(at)));
  return !(now.getTime() - newest <= hours * 60 * 60 * 1000);
}

/**
 * The decision with the guards applied: a done becomes a skip with the
 * guard's reason. The board card is read last, as it costs a request.
 */
export async function guardDone(
  task: TaskRow,
  decision: Decision,
  memory: Memory,
  options: { readonly guards: CloseGuards | undefined; readonly now: Date },
): Promise<Decision> {
  const { guards, now } = options;
  if (decision.kind !== "done" || guards === undefined) {
    return decision;
  }
  if (mergedTooLongAgo(decision.pulls, now, guards.mergeWindowHours)) {
    return { kind: "skip", why: `its last merge is over ${guards.mergeWindowHours} hours old` };
  }
  if (saysMorePulls(task, memory)) {
    return {
      kind: "skip",
      why: "its description or newest comments say more pull requests follow",
    };
  }
  if (await guards.boardCard(task.id)) {
    return { kind: "skip", why: "it has an open board card" };
  }
  return decision;
}
