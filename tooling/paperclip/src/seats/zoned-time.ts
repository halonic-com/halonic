/**
 * Wall-clock times in a named time zone, turned into instants. Claude Code
 * prints reset times as the reader's local time with the zone's name
 * ("Nov 25, 3pm (Europe/Amsterdam)"), so the seats readings need this.
 * Built on `Intl` only: no time zone database of our own.
 */

/** A date and time as a clock in some time zone shows it. Months count from 1. */
export interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const minuteMs = 60_000;

/** The wall time a clock in `timeZone` shows at `instantMs`. Throws on an unknown zone. */
export function wallTimeAt(instantMs: number, timeZone: string): WallTime {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const parts = new Map(format.formatToParts(instantMs).map((part) => [part.type, part.value]));
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.get(type));
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function asIfUtc(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/** How far `timeZone` is ahead of UTC at `instantMs`, in milliseconds. */
function offsetAt(instantMs: number, timeZone: string): number {
  const flooredToMinute = Math.floor(instantMs / minuteMs) * minuteMs;
  return asIfUtc(wallTimeAt(flooredToMinute, timeZone)) - flooredToMinute;
}

/**
 * The instant at which a clock in `timeZone` shows `wall`. Around a daylight
 * saving change the offset differs before and after, so it is checked twice.
 * Throws a `RangeError` on an unknown zone.
 */
export function instantOf(wall: WallTime, timeZone: string): number {
  const guess = asIfUtc(wall);
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  return second;
}
