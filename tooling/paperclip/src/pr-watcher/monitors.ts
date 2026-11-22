import type { TaskRow } from "./paperclip.ts";

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

/** An ISO time in milliseconds; no time compares false with every number. */
function time(iso: string | null): number {
  return iso === null ? Number.NaN : Date.parse(iso);
}
