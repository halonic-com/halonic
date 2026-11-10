// When things in a run happened, as the command line writes the time
// (cli-output 3.4, the When rule): the `runs` list, the heading of
// `runs show` and its step lines all say "10:31", "yesterday 16:40",
// "3 Nov 14:05" or "3 Nov 2025" in the computer's own time zone.

import type { DueAt, EndedAt, StartedAt } from "./messages/runs-list.ts";

/** The clock and time zone run times are written in. */
export interface RunClock {
  /** The time it is now, so "today" and "yesterday" are right. */
  readonly now: Date;
  /** An IANA time zone such as "Europe/Amsterdam"; the computer's own by default. */
  readonly timeZone?: string;
}

/**
 * When a run started, as the When column writes it: today's time, yesterday,
 * a day this year, or a day in an earlier year, all in the clock's time zone.
 */
export function startedAt(start: Date, clock: RunClock): StartedAt {
  const day = calendarDay(start, clock.timeZone);
  const today = calendarDay(clock.now, clock.timeZone);
  const time = clockTime(start.toISOString(), clock);
  if (sameDay(day, today)) {
    return { day: "today", time };
  }
  const yesterday = calendarDay(new Date(clock.now.getTime() - dayInMs), clock.timeZone);
  if (sameDay(day, yesterday)) {
    return { day: "yesterday", time };
  }
  const date = { day: day.day, month: day.month };
  if (day.year === today.year) {
    return { day: "thisYear", date, time };
  }
  return { day: "earlier", date, year: day.year };
}

/**
 * When a waiting run's timer is due, as the What column writes it: today's
 * time, tomorrow, or a later day, in the clock's time zone.
 */
export function dueAt(due: Date, clock: RunClock): DueAt {
  const day = calendarDay(due, clock.timeZone);
  const time = clockTime(due.toISOString(), clock);
  if (sameDay(day, calendarDay(clock.now, clock.timeZone))) {
    return { day: "today", time };
  }
  const tomorrow = calendarDay(new Date(clock.now.getTime() + dayInMs), clock.timeZone);
  if (sameDay(day, tomorrow)) {
    return { day: "tomorrow", time };
  }
  return { day: "later", date: { day: day.day, month: day.month }, time };
}

/**
 * When a run ended, as a refused `runs send` says it: whole minutes ago
 * within the hour, at least 1, else as {@link startedAt} gives a time.
 */
export function endedAt(ended: Date, clock: RunClock): EndedAt {
  const ago = clock.now.getTime() - ended.getTime();
  if (ago < hourInMs) {
    return { day: "withinTheHour", minutes: Math.max(1, Math.floor(ago / minuteInMs)) };
  }
  return startedAt(ended, clock);
}

const minuteInMs = 60 * 1000;
const hourInMs = 60 * minuteInMs;
const dayInMs = 24 * hourInMs;

interface YearDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function sameDay(a: YearDay, b: YearDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function calendarDay(date: Date, timeZone: string | undefined): YearDay {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((each) => each.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** "10:31": hours and minutes on a 24-hour clock, in the clock's time zone. */
function clockTime(iso: string, clock: RunClock): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: clock.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
