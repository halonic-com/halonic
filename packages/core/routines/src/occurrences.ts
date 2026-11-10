import type { RoutineTrigger } from "@halonicjs/format";
import { cronTimeFinder } from "./next-cron-time.ts";
import { checkTimeZone, DEFAULT_TIME_ZONE } from "./time-zone.ts";

const DEFAULT_LIMIT = 100;

/**
 * The times a scheduled trigger fires in the window after `from` up to and
 * including `to`, oldest first, at most `limit` of them, in `timeZone` when
 * the schedule names no zone. Only schedule triggers have such times; any
 * other kind gives an empty list.
 *
 * @param timeZone pass the tick policy's `timeZone`, so the times match `due`
 * @throws {CronError} when the cron doesn't parse, or the zone is unknown
 */
export function occurrences(
  trigger: RoutineTrigger,
  from: Date,
  to: Date,
  limit = DEFAULT_LIMIT,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date[] {
  if (!("schedule" in trigger)) return [];
  const zone = trigger.timezone ?? timeZone;
  checkTimeZone(zone);
  return timesBetween(cronTimeFinder(trigger.schedule, zone), from, to, limit);
}

/**
 * The times `nextTime` gives after `from` up to and including `to`, oldest
 * first, at most `limit` of them. Takes a finder from `cronTimeFinder`, so a
 * caller that walks many windows of one cron builds it once.
 */
export function timesBetween(
  nextTime: (after: Date) => Date | null,
  from: Date,
  to: Date,
  limit: number,
): Date[] {
  const times: Date[] = [];
  let current = from;
  while (times.length < limit) {
    const next = nextTime(current);
    if (!next || next > to) break;
    times.push(next);
    current = next;
  }
  return times;
}
