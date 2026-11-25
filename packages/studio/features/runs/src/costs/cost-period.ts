/** The spans the Costs view offers: today, the last 7 days and the last 30 days, today included. */
export type CostPeriod = "today" | "7-days" | "30-days";

const daysBack: Readonly<Record<CostPeriod, number>> = {
  today: 0,
  "7-days": 6,
  "30-days": 29,
};

const millisecondsPerDay = 86_400_000;

interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * When a period starts: midnight in `timeZone` on the first day it covers.
 * The time and the zone are inputs, never read from the machine, so the same
 * call gives the same answer in a test and on a laptop in another country.
 * Days are counted on the calendar, so a period over a change to or from
 * daylight saving time still starts at local midnight.
 *
 * @param period - today, 7 days or 30 days, each including today
 * @param now - the current time
 * @param timeZone - an IANA time zone, such as "Europe/Madrid"
 * @returns the first instant inside the period
 *
 * @example
 * costPeriodStart("7-days", new Date("2026-11-25T10:00:00Z"), "Europe/Madrid");
 * // 2026-11-18T23:00:00.000Z, midnight on 19 November in Madrid
 */
export function costPeriodStart(period: CostPeriod, now: Date, timeZone: string): Date {
  const today = calendarDayIn(now, timeZone);
  const firstDay = calendarDayBefore(today, daysBack[period]);
  return localMidnight(firstDay, timeZone);
}

/**
 * The first instant of the calendar day `instant` falls on in `timeZone`:
 * local midnight, or the clocks' jump on a day that skips it.
 *
 * @example
 * dayStart(new Date("2026-11-25T10:00:00Z"), "Europe/Madrid"); // 2026-11-24T23:00:00.000Z
 */
export function dayStart(instant: Date, timeZone: string): Date {
  return localMidnight(calendarDayIn(instant, timeZone), timeZone);
}

/** The calendar day an instant falls on in a time zone. */
function calendarDayIn(instant: Date, timeZone: string): CalendarDay {
  const parts = dateParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** The calendar day `count` days before `day`; UTC arithmetic, so no zone shifts it. */
function calendarDayBefore(day: CalendarDay, count: number): CalendarDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day) - count * millisecondsPerDay);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * The first instant of `day` in `timeZone`: 00:00, or the moment the clocks
 * jump when they skip midnight (America/Santiago springs from 00:00 to 01:00).
 * Midnight is tried with the zone's offset from the evening before and from
 * the morning after, so a daylight saving change on either side of it is
 * seen, and the earliest try that lands on `day` itself wins.
 */
function localMidnight(day: CalendarDay, timeZone: string): Date {
  const wallClock = Date.UTC(day.year, day.month - 1, day.day);
  const halfDay = millisecondsPerDay / 2;
  const tries = [wallClock - halfDay, wallClock + halfDay].map(
    (around) => wallClock - offsetAt(new Date(around), timeZone),
  );
  const onTheDay = tries.filter((instant) =>
    sameDay(calendarDayIn(new Date(instant), timeZone), day),
  );
  return new Date(Math.min(...(onTheDay.length > 0 ? onTheDay : tries)));
}

function sameDay(left: CalendarDay, right: CalendarDay): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/** How far the zone's wall clock is ahead of UTC at an instant, in milliseconds. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = dateParts(instant, timeZone);
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return wallClock - wholeSeconds;
}

interface DateParts extends CalendarDay {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** The wall clock in a time zone, as numbers. */
function dateParts(instant: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const values = new Map(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(values.get(type));
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}
