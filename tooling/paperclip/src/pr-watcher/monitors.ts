import type { Paperclip, TaskRow } from "./paperclip.ts";

/**
 * Paperclip monitors on open tasks: the model runs the watcher replaces.
 * Each monitor that fires is one run of the assignee that only checks.
 */

/** How far back a pass looks for monitors that fired: the job's 10-minute schedule. */
export const passWindowMs = 10 * 60_000;

/** Monitors waiting and fired in the last pass, on all open tasks and on those with a pull request. */
export interface MonitorCounts {
  readonly set: number;
  readonly fired: number;
  readonly setOnPrTasks: number;
  readonly firedOnPrTasks: number;
}

/**
 * Counts monitors on `tasks`; `prTasks` holds the identifiers of those with a
 * pull request. "Fired" means in the `windowMs` before `now`.
 * A task closed since its monitor fired isn't open any more, so `fired` is a
 * lower bound.
 */
export function countMonitors(
  tasks: readonly TaskRow[],
  prTasks: ReadonlySet<string>,
  now: Date,
  windowMs = passWindowMs,
): MonitorCounts {
  const until = now.getTime();
  const isSet = (task: TaskRow) => time(task.monitorNextCheckAt) > until;
  const hasFired = (task: TaskRow) => {
    const last = time(task.monitorLastTriggeredAt);
    return last > until - windowMs && last <= until;
  };
  const onPr = tasks.filter((task) => prTasks.has(task.identifier));
  return {
    set: tasks.filter(isSet).length,
    fired: tasks.filter(hasFired).length,
    setOnPrTasks: onPr.filter(isSet).length,
    firedOnPrTasks: onPr.filter(hasFired).length,
  };
}

const hourMs = 60 * 60_000;

/** How far ahead the watcher keeps the fallback monitor of a task it watches. */
export const fallbackAheadMs = 6 * hourMs;

/** A monitor due sooner than this is the author's own short check (CI after a push): left alone. */
export const shortCheckMs = hourMs;

/** The watcher moves a monitor again only once it is due within this, so it writes about once an hour, not every pass. */
export const renewWithinMs = 5 * hourMs;

/**
 * The new check time for the fallback monitor of a task the watcher watches,
 * or undefined when it leaves the monitor alone: there is none, it is the
 * author's short check, or it is still far enough ahead (HAL-16401 part 3).
 * While the watcher runs, the monitor stays 5 to 6 hours out and never fires;
 * if the watcher stops, it fires within 6 hours.
 */
export function postponeUntil(nextCheckAt: string | null, now: Date): string | undefined {
  const dueInMs = time(nextCheckAt) - now.getTime();
  if (Number.isNaN(dueInMs) || dueInMs < shortCheckMs || dueInMs >= renewWithinMs) {
    return undefined;
  }
  return new Date(now.getTime() + fallbackAheadMs).toISOString();
}

/** What moving a monitor needs from the watcher's options. */
export interface MoveOptions {
  readonly paperclip: Pick<Paperclip, "postponeMonitor">;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/**
 * Moves a task's monitor to `until`, logging each line after `lead`:
 * undefined when it was already due then or later, `refused` when
 * Paperclip refused, with the reason in the log.
 */
export async function moveMonitor(
  options: MoveOptions,
  taskId: string,
  until: string,
  lead: string,
): Promise<"postponed" | "refused" | undefined> {
  if (options.dryRun) {
    options.log(`${lead}would move its monitor to ${until} (dry run)`);
    return "postponed";
  }
  try {
    if ((await options.paperclip.postponeMonitor(taskId, until)) === "unchanged") {
      return undefined;
    }
    options.log(`${lead}moved its monitor to ${until}`);
    return "postponed";
  } catch (error) {
    options.log(`${lead}couldn't move its monitor: ${(error as Error).message}`);
    return "refused";
  }
}

/** An ISO time in milliseconds; no time compares false with every number. */
function time(iso: string | null): number {
  return iso === null ? Number.NaN : Date.parse(iso);
}
