import type { Money, TokenCount } from "@halonicjs/ports";

/** Where the Team screens read the time from: the clock, and the time zone to show it in. */
export interface TeamClock {
  readonly now: () => Date;
  /** An IANA time zone such as "UTC"; left out, the computer's own. */
  readonly timeZone?: string;
}

const minuteMs = 60 * 1000;

/** Money as the renders show it: "$41.20" with cents, or "$1,500" in whole units. */
export function formatMoney(money: Money, wholeUnits = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: wholeUnits ? 0 : 2,
    maximumFractionDigits: wholeUnits ? 0 : 2,
  }).format(money.cents / 100);
}

/** A token count the way the renders write it: "41M", "1.2M", "210k", "800". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${roundForShow(count / 1_000_000)}M`;
  if (count >= 1_000) return `${roundForShow(count / 1_000)}k`;
  return String(count);
}

/** Every token of some work, of every kind. */
export function allTokens(tokens: TokenCount): number {
  return tokens.input + tokens.cached + tokens.output;
}

/** One decimal below 10 ("1.2"), none from 10 up ("41"). */
function roundForShow(value: number): string {
  return value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value));
}

/** "13:00" in the clock's time zone. */
export function formatTime(at: string, clock: TeamClock): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: clock.timeZone,
  }).format(new Date(at));
}

/** "Thu 09:00": a weekday and a time, for a reset or a refill. */
export function formatDayTime(at: string, clock: TeamClock): string {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: clock.timeZone });
  return `${day.format(new Date(at))} ${formatTime(at, clock)}`;
}

/** "28 Nov": a date in the month, for a budget forecast. */
export function formatDate(at: Date, clock: TeamClock): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: clock.timeZone,
  }).format(at);
}

/** Whole minutes from `at` to now, never below zero. */
export function minutesSince(at: string, clock: TeamClock): number {
  return Math.max(0, Math.floor((clock.now().getTime() - Date.parse(at)) / minuteMs));
}

/** Today's day of the month and the month's length, in the clock's time zone. */
export function monthDay(clock: TeamClock): { day: number; daysInMonth: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: clock.timeZone,
  }).formatToParts(clock.now());
  const part = (type: string) => Number(parts.find((each) => each.type === type)?.value);
  const daysInMonth = new Date(Date.UTC(part("year"), part("month"), 0)).getUTCDate();
  return { day: part("day"), daysInMonth };
}
