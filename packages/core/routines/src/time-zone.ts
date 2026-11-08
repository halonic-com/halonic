import { CronError } from "./cron-error.ts";

/** One minute in milliseconds. */
export const MINUTE = 60_000;

/** The time on a wall clock in some time zone, to the minute. */
export interface WallTime {
  year: number;
  /** 1 = January. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
}

/**
 * Checks that `timeZone` is an IANA time zone this runtime knows.
 *
 * @throws {CronError} saying which zone is unknown
 */
export function checkTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    // Intl only says "Invalid time zone specified"; name the zone instead.
    throw new CronError(`Unknown time zone "${timeZone}"`);
  }
}

/**
 * The wall-clock time of `date` in `timeZone`, or in this machine's zone when
 * no zone is given. Uses `Intl` only, so it runs on any JavaScript runtime.
 *
 * @throws {RangeError} when the zone is unknown; call {@link checkTimeZone} first for a readable error
 */
export function wallTime(date: Date, timeZone?: string): WallTime {
  return wallTimeReader(timeZone)(date.getTime());
}

/**
 * Returns a function that reads wall-clock times in one zone. Building the
 * `Intl` formatter is the slow part, so a search that reads many times builds
 * it once through this instead of calling {@link wallTime} in a loop.
 */
export function wallTimeReader(timeZone?: string): (instant: number) => WallTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...(timeZone === undefined ? {} : { timeZone }),
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  return (instant) => {
    const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
    for (const part of formatter.formatToParts(instant)) parts[part.type] = part.value;
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    return {
      year,
      month,
      day,
      // Some engines print midnight as "24" even with hourCycle h23.
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    };
  };
}

/**
 * How far the wall clock is ahead of UTC at `instant`, in milliseconds, given
 * the wall time already read for it. Seconds are dropped on both sides, so
 * the result is a whole number of minutes.
 */
export function utcOffset(instant: number, wall: WallTime): number {
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return wallAsUtc - Math.floor(instant / MINUTE) * MINUTE;
}
