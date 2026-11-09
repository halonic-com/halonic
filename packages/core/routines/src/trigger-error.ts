import type { RoutineTrigger } from "@halonicjs/format";
import { parseCron } from "./parse-cron.ts";
import { parseEvery } from "./parse-every.ts";
import { checkTimeZone } from "./time-zone.ts";

/**
 * A readable message when a trigger can't be used, or null when it is fine:
 * a cron that doesn't parse, an unknown time zone, or an interval that is not
 * a count and a unit. The message is the one the parser gives.
 *
 * @example
 * triggerError({ schedule: "0 8 * * 1-5", timezone: "Mars/Olympus" }); // 'Unknown time zone "Mars/Olympus".'
 * triggerError({ every: "15m" }); // null
 */
export function triggerError(trigger: RoutineTrigger): string | null {
  try {
    if ("schedule" in trigger) {
      parseCron(trigger.schedule);
      if (trigger.timezone) checkTimeZone(trigger.timezone);
    } else if ("every" in trigger) {
      parseEvery(trigger.every);
    } else if ("mail" in trigger) {
      parseEvery(trigger.mail.every);
    }
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
