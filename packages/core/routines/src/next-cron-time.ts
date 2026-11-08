import { type Cron, parseCron } from "./parse-cron.ts";
import { addWallMinutes, MINUTE, utcOffset, type WallTime, wallTimeReader } from "./time-zone.ts";

type ReadWallTime = (instant: number) => WallTime;

const MINUTES_PER_DAY = 24 * 60;
const DAY = MINUTES_PER_DAY * MINUTE;

// About five years: long enough to reach the next 29 February, while a cron
// that can never match, such as "0 0 30 2 *", still gives up.
const SEARCH_LIMIT = 5 * 366 * DAY;

/**
 * The first whole minute strictly after `after` at which the cron fires in
 * `timeZone`, or null when none comes within about five years. Without a
 * zone it uses this machine's zone.
 *
 * Daylight saving time works as in classic cron. A job with a wildcard hour
 * (`*` or `*\/n`, such as `*\/15 * * * *`) follows the wall clock: it runs
 * through both copies of an hour the clocks repeat, and doesn't make up the
 * minutes they skip. A job at set hours (such as `30 1 * * *`) fires at most
 * once for each wall time: only in the first copy of a repeated hour, and, when
 * its time falls in a gap the clocks skip, once at the first minute after the
 * gap.
 *
 * @throws {CronError} when `cron` is a string that doesn't parse
 * @throws {RangeError} when the zone is unknown; call `checkTimeZone` first for a readable error
 */
export function nextCronTime(cron: Cron | string, after: Date, timeZone?: string): Date | null {
  const schedule = typeof cron === "string" ? parseCron(cron) : cron;
  const readWallTime = wallTimeReader(timeZone);
  let instant = Math.floor(after.getTime() / MINUTE) * MINUTE + MINUTE;
  const limit = instant + SEARCH_LIMIT;
  while (instant < limit) {
    const wall = readWallTime(instant);
    if (firesAt(schedule, instant, wall, readWallTime)) return new Date(instant);
    const skip = Math.max(minutesToSkip(schedule, wall), 1);
    instant = skipForward(instant, wall, skip, readWallTime);
  }
  return null;
}

function firesAt(cron: Cron, instant: number, wall: WallTime, readWallTime: ReadWallTime): boolean {
  if (cron.hoursWildcard) return matches(cron, wall);
  if (matches(cron, wall)) return !wallTimeShownBefore(instant, wall, readWallTime);
  return wallTimesSkippedBefore(instant, wall, readWallTime).some((skipped) =>
    matches(cron, skipped),
  );
}

function matches(cron: Cron, wall: WallTime): boolean {
  return minutesToSkip(cron, wall) === 0;
}

// How many wall-clock minutes are certain not to match: the rest of the day
// when the day doesn't match, the rest of the hour when the hour doesn't, one
// minute when only the minute doesn't, and 0 on a match.
function minutesToSkip(cron: Cron, wall: WallTime): number {
  if (!cron.months.has(wall.month) || !dayMatches(cron, wall)) {
    return MINUTES_PER_DAY - (wall.hour * 60 + wall.minute);
  }
  if (!cron.hours.has(wall.hour)) return 60 - wall.minute;
  if (!cron.minutes.has(wall.minute)) return 1;
  return 0;
}

function dayMatches(cron: Cron, wall: WallTime): boolean {
  const dayOfMonthMatches = cron.days.has(wall.day);
  const dayOfWeekMatches = cron.weekdays.has(wall.weekday);
  if (cron.dayOr) return dayOfMonthMatches || dayOfWeekMatches;
  return (cron.daysAny || dayOfMonthMatches) && (cron.weekdaysAny || dayOfWeekMatches);
}

/**
 * Whether the clocks went back over `wall`, so it already showed once at an
 * earlier instant (in New York on 2026-11-01, 01:30 EST was shown first as
 * 01:30 EDT). Clocks go back at most once a day, so the offset a day earlier
 * says how far.
 */
function wallTimeShownBefore(instant: number, wall: WallTime, readWallTime: ReadWallTime): boolean {
  const dayBefore = instant - DAY;
  const wentBackBy = utcOffset(dayBefore, readWallTime(dayBefore)) - utcOffset(instant, wall);
  if (wentBackBy <= 0) return false;
  const earlier = instant - wentBackBy;
  return sameWallTime(readWallTime(earlier), wall);
}

/**
 * The wall times the clocks jumped over just before `instant`, oldest first,
 * or none when the clocks didn't go forward there. At 03:00 EDT in New York on
 * 2026-03-08 they are 02:00 to 02:59.
 */
function wallTimesSkippedBefore(
  instant: number,
  wall: WallTime,
  readWallTime: ReadWallTime,
): WallTime[] {
  const before = instant - MINUTE;
  const wentForwardBy = utcOffset(instant, wall) - utcOffset(before, readWallTime(before));
  const skipped: WallTime[] = [];
  for (let back = wentForwardBy / MINUTE; back > 0; back--) {
    skipped.push(addWallMinutes(wall, -back));
  }
  return skipped;
}

function sameWallTime(a: WallTime, b: WallTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}

/**
 * Moves `instant` on by `wallMinutes` of wall-clock time without passing a
 * minute that could fire.
 *
 * The skip is counted on the wall clock but taken in real time. When the
 * clocks go back inside it, we land a little early, which is safe: the next
 * look skips again. When they go forward, we would land past the boundary
 * by the size of the jump and miss the minutes just after it (the old code
 * missed 00:00-00:59 of the day after a spring-forward), so we stop at the
 * first minute after the jump instead. That is also where a job at set hours
 * makes up a time inside the gap.
 */
function skipForward(
  instant: number,
  wall: WallTime,
  wallMinutes: number,
  readWallTime: ReadWallTime,
): number {
  const landing = instant + wallMinutes * MINUTE;
  const offset = utcOffset(instant, wall);
  if (utcOffset(landing, readWallTime(landing)) <= offset) return landing;
  return firstMinuteAfterChange(instant, landing, offset, readWallTime);
}

/**
 * The first minute in (`from`, `to`] whose UTC offset is no longer `offset`,
 * found by halving. `from` has that offset and `to` doesn't. A skip is at
 * most a day and clocks change at most once in one, so there is one change.
 */
function firstMinuteAfterChange(
  from: number,
  to: number,
  offset: number,
  readWallTime: ReadWallTime,
): number {
  let low = from;
  let high = to;
  while (high - low > MINUTE) {
    const middle = low + Math.floor((high - low) / MINUTE / 2) * MINUTE;
    if (utcOffset(middle, readWallTime(middle)) === offset) low = middle;
    else high = middle;
  }
  return high;
}
