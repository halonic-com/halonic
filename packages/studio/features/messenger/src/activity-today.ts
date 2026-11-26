import type { MessagingId, TeamRun, TeamRuns, WorkItem, WorkState } from "@halonicjs/ports";
import type { RunOutcome } from "./activity.ts";

/** How many earlier runs and next tasks the panel lists at most (HAL-18558 section 2). */
const listedAtMost = 3;

/** A run is "just ended" for this long; after that the panel says when the last run ended. */
const justEndedMinutes = 10;

/** One of today's earlier runs, as **Earlier today** lists it. */
export interface EarlierRun {
  readonly id: MessagingId;
  readonly outcome: RunOutcome;
  /** "ACME-7 Ship the site"; none for a run on no task, or a task the key can't see. */
  readonly task?: string;
  readonly startedAt: Date;
  readonly minutes: number;
}

/** One task under **Next**: "Ship the site", "ACME-7 · To do". */
export interface NextTask {
  readonly id: MessagingId;
  readonly label: string;
  readonly title: string;
  readonly state: WorkState;
}

/**
 * Today's earlier runs of `agent` (`messenger.activity-panel`): its finished runs that started,
 * newest first, leaving out `shown` (the run the panel shows already), at most 3. A run with no
 * start, which never ran, isn't listed.
 *
 * @example
 * earlierToday(agent, runs, lastRun.id).map((run) => run.outcome); // ["done", "stopped"]
 */
export function earlierToday(
  agent: MessagingId,
  runs: readonly TeamRuns[],
  shown: MessagingId | undefined,
): readonly EarlierRun[] {
  return runs
    .flatMap((each) => each.runs)
    .filter((run) => run.agent === agent && run.id !== shown)
    .flatMap((run) => earlierOf(run))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, listedAtMost);
}

/**
 * The tasks `agent` holds that are still open, newest first, leaving out `current` (the task its
 * run works on), at most 3, for **Next**. Done and cancelled tasks aren't next.
 */
export function nextFor(
  agent: MessagingId,
  work: readonly WorkItem[],
  current: MessagingId | undefined,
): readonly NextTask[] {
  return work
    .filter((item) => item.assignee === agent && item.id !== current && isOpen(item.state))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, listedAtMost)
    .map(({ id, label, title, state }) => ({ id, label, title, state }));
}

/** Whether a run that ended at `finishedAt` ended just now: within the last 10 minutes. */
export function endedJustNow(finishedAt: Date, now: Date): boolean {
  return now.getTime() - finishedAt.getTime() < justEndedMinutes * 60_000;
}

function earlierOf(run: TeamRun): readonly EarlierRun[] {
  if (run.startedAt === undefined || run.finishedAt === undefined) return [];
  const startedAt = new Date(run.startedAt);
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(run.finishedAt) - startedAt.getTime()) / 60_000),
  );
  const task = [run.task?.identifier, run.task?.title].filter((part) => part !== undefined);
  return [
    {
      id: run.id,
      outcome: outcomeOf(run),
      ...(task.length === 0 ? {} : { task: task.join(" ") }),
      startedAt,
      minutes,
    },
  ];
}

/** Done, Failed or Stopped, as the panel's last run says it. */
export function outcomeOf(run: TeamRun): RunOutcome {
  if (run.state === "succeeded") return "done";
  if (run.state === "failed" || run.state === "timed-out") return "failed";
  // A lost run (`interrupted`) didn't fail its work, so it stopped.
  return "stopped";
}

function isOpen(state: WorkState): boolean {
  return state !== "done" && state !== "cancelled";
}
