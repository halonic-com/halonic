import type { RoutineTrigger } from "@halonicjs/format";
import { CronError } from "./cron-error.ts";
import { describeCron } from "./describe-cron.ts";
import { parseEvery } from "./parse-every.ts";
import { everyCount } from "./schedule-words.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** What a mail trigger looks for when it has no query of its own. */
const DEFAULT_MAIL_QUERY = "in:inbox";

/**
 * Writes a trigger out in words for people. A schedule reads as its cron
 * description with the time zone after it, an interval as "Every 15 minutes",
 * and a schedule or interval that doesn't parse as text that says so, so a
 * list of routines can still show it.
 *
 * @example
 * describeTrigger({ schedule: "0 8 * * 1-5", timezone: "Europe/Amsterdam" }); // "Weekdays at 08:00 (Europe/Amsterdam)"
 * describeTrigger({ every: "1d" }); // "Every day (UTC)"
 * describeTrigger({ manual: true }); // "Manual only"
 */
export function describeTrigger(trigger: RoutineTrigger): string {
  if ("manual" in trigger) return "Manual only";
  if ("signal" in trigger) {
    return `On signal ${trigger.signal.name}${trigger.signal.when ? " (filtered)" : ""}`;
  }
  if ("mail" in trigger) {
    const { connector, query } = trigger.mail;
    return `New mail in ${connector}${query === DEFAULT_MAIL_QUERY ? "" : ` matching "${query}"`}`;
  }
  if ("every" in trigger) return describeEvery(trigger.every);
  return describeSchedule(trigger.schedule, trigger.timezone);
}

function describeSchedule(expression: string, timeZone: string | undefined): string {
  try {
    const words = describeCron(expression);
    return timeZone ? `${words} (${timeZone})` : words;
  } catch (error) {
    if (error instanceof CronError) return `Invalid schedule "${expression}"`;
    throw error;
  }
}

/**
 * The largest unit that divides the interval evenly: "120m" reads "Every 2
 * hours (UTC)". Slots count from the Unix epoch in UTC, so an interval of whole
 * hours or days says so; minutes are the same in every zone.
 */
function describeEvery(text: string): string {
  let length: number;
  try {
    length = parseEvery(text);
  } catch (error) {
    if (error instanceof CronError) return `Every ${text}`;
    throw error;
  }
  if (length % DAY === 0) return `${everyCount(length / DAY, "day")} (UTC)`;
  if (length % HOUR === 0) return `${everyCount(length / HOUR, "hour")} (UTC)`;
  return everyCount(length / MINUTE, "minute");
}
