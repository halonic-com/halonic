import type { RoutineTrigger } from "@halonicjs/format";
import { nextCronTime } from "./next-cron-time.ts";

const DEFAULT_LIMIT = 100;

/**
 * The times a scheduled trigger fires in the window after `from` up to and
 * including `to`, oldest first, at most `limit` of them. Only schedule
 * triggers have such times; any other kind gives an empty list.
 *
 * @throws {CronError} when the cron doesn't parse
 */
export function occurrences(
  trigger: RoutineTrigger,
  from: Date,
  to: Date,
  limit = DEFAULT_LIMIT,
): Date[] {
  if (!("schedule" in trigger)) return [];
  const times: Date[] = [];
  let current = from;
  while (times.length < limit) {
    const next = nextCronTime(trigger.schedule, current, trigger.timezone);
    if (!next || next > to) break;
    times.push(next);
    current = next;
  }
  return times;
}
