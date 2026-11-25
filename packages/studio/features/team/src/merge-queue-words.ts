import type { QueueView } from "./merge-queue.ts";

/**
 * The health line in two parts: the chip's word ("Running", "⚠ Runners busy") and the details after
 * it, each read with a "·" between them.
 */
export interface HealthWords {
  /** Empty for a health a provider can't map: the line then starts with the details. */
  readonly chip: string;
  readonly details: readonly string[];
}

/** "7 PRs", "1 PR". */
const prs = (count: number) => (count === 1 ? "1 PR" : `${count} PRs`);

/** The runner wait while the queue runs: "no runner wait", or the wait when there is one. */
function runnerWait(minutes: number | undefined): string {
  if (minutes === undefined || minutes === 0) return "no runner wait";
  return `longest wait ${minutes} min`;
}

/**
 * The words for the queue's health. Under the list tabs (`list`, P1) a running queue names the
 * group building; on the Queue tab (`queue`, P18) it names today's median time to merge instead.
 */
function healthWords(view: QueueView, where: "list" | "queue"): HealthWords {
  switch (view.health) {
    case "running": {
      const building =
        where === "list" && view.building !== undefined
          ? [`group ${view.building.number} of ${view.building.of} building`]
          : [];
      const median =
        where === "queue" && view.medianMinutesToMerge !== undefined
          ? [`median ${view.medianMinutesToMerge} min to merge today`]
          : [];
      return {
        chip: "Running",
        details: [prs(view.total), ...building, runnerWait(view.runnerWaitMinutes), ...median],
      };
    }
    case "runners-busy": {
      const wait =
        view.runnerWaitMinutes === undefined ? [] : [`longest wait ${view.runnerWaitMinutes} min`];
      return { chip: "⚠ Runners busy", details: [...wait, "pushes are on hold"] };
    }
    case "stopped":
      return { chip: "⚠ Stopped", details: [prs(view.total)] };
    case "empty":
      return { chip: "", details: [mergeQueueWords.empty] };
    default:
      return { chip: "", details: [prs(view.total)] };
  }
}

/**
 * The merge queue's words on the Pull requests screen, as Noah's HAL-17515
 * `wording` table has them (P1, P6, P10 and P18–P22). "Stopped" is the
 * flows' word for a queue stopped by repeated group failures (HAL-17510 2.3).
 */
export const mergeQueueWords = {
  tabs: { queue: "Queue", merged: "Merged today" },
  /** The start of the health line under the list tabs (P1). */
  linePrefix: "Merge queue: ",
  health: healthWords,
  empty: "The merge queue is empty.",
  emptyHint: "Approved PRs with a green ci-ok show up here once the queue session adds them.",
  group: (position: number) => `Group ${position}`,
  passed: "ci-ok passed · merging",
  building: (minutes: number) => `Building · ${minutes} min`,
  groupFailed: (culprit: string | undefined) =>
    culprit === undefined ? "Group failed" : `Group failed: ${culprit}`,
  testedAgain: (count: number) =>
    count === 1
      ? "the PR behind it is being tested again"
      : `the ${count} PRs behind it are being tested again`,
  culprit: (label: string, time: string) =>
    `The queue session named ${label} as the cause and took it out at ${time}.`,
  waiting: "Waiting to enter",
  hint: "Numbers are real positions. A time to merge shows only when GitHub gives one; it is never guessed.",
  takenOut: (count: number) => `Taken out today (${count})`,
  merged: "Merged today",
  newestFirst: "newest first",
  noneMerged: "No pull requests merged today.",
};
