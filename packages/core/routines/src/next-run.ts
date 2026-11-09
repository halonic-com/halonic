import type { RoutineTrigger } from "@halonicjs/format";
import { slotAfter } from "./interval-slots.ts";
import { nextCronTime } from "./next-cron-time.ts";
import { parseEvery } from "./parse-every.ts";
import { checkTimeZone, DEFAULT_TIME_ZONE } from "./time-zone.ts";

/**
 * When the trigger fires next, strictly after `after`, on the same clock
 * `due` uses. A schedule gives its next cron time, in `timeZone` when the
 * schedule names no zone. An interval gives its next slot counted from the
 * Unix epoch, whenever it last ran. Manual, signal and mail triggers never
 * fire on a clock, so they give null.
 *
 * @param timeZone pass the tick policy's `timeZone`, so the answer matches `due`
 * @throws {CronError} when the cron or interval doesn't parse, or the zone is unknown
 */
export function nextRun(
  trigger: RoutineTrigger,
  after: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  if ("schedule" in trigger) {
    const zone = trigger.timezone ?? timeZone;
    checkTimeZone(zone);
    return nextCronTime(trigger.schedule, after, zone);
  }
  if (!("every" in trigger)) return null;
  return new Date(slotAfter(parseEvery(trigger.every), after.getTime()));
}
