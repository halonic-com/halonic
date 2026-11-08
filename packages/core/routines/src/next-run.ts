import type { RoutineTrigger } from "@halonicjs/format";
import { nextCronTime } from "./next-cron-time.ts";
import { parseEvery } from "./parse-every.ts";

/**
 * When the trigger fires next from `after`. A schedule gives the next cron
 * time after `after`. An interval gives one interval after `lastRun`, or
 * `after` itself when it never ran or that time has passed. Manual, signal
 * and mail triggers never fire on a clock, so they give null.
 *
 * @throws {CronError} when the cron or interval doesn't parse
 */
export function nextRun(
  trigger: RoutineTrigger,
  after: Date,
  lastRun: Date | null = null,
): Date | null {
  if ("schedule" in trigger) return nextCronTime(trigger.schedule, after, trigger.timezone);
  if (!("every" in trigger)) return null;
  if (!lastRun) return after;
  const next = new Date(lastRun.getTime() + parseEvery(trigger.every));
  return next < after ? after : next;
}
