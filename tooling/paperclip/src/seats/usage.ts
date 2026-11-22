/**
 * Reads what `claude -p "/usage"` prints for one seat. Claude Code writes one
 * line per limit window, for example
 *
 *     Current session: 23% used · resets Nov 22, 3pm (UTC)
 *     Current week (all models): 41% used · resets Nov 25, 9:30am (UTC)
 *     Current week (Sonnet only): 12% used · resets Nov 25, 9:30am (UTC)
 *
 * No I/O here: the seats plugin runs the program and hands the text over.
 */

import { instantOf, type WallTime, wallTimeAt } from "./zoned-time.ts";

/** Which limit a line is about: the 5-hour session, the week, or the week for one model. */
export type WindowKind = "session" | "week" | "week-model";

/** One limit window of one seat. */
export interface UsageWindow {
  readonly kind: WindowKind;
  /** The model's name as Claude Code prints it, for `week-model` only ("Sonnet only"). */
  readonly model: string | undefined;
  /** Whole percent of the window's allowance used, as printed. */
  readonly usedPercent: number;
  /** When the window resets, as an ISO time; `undefined` when no reset was printed or it can't be read. */
  readonly resetsAt: string | undefined;
  /** The reset text as printed, kept for the page when `resetsAt` couldn't be read. */
  readonly resetText: string | undefined;
}

/** The outcome of reading one seat's `/usage` text. */
export type UsageReading =
  | { readonly kind: "read"; readonly at: string; readonly windows: readonly UsageWindow[] }
  | { readonly kind: "unreadable"; readonly at: string; readonly why: string };

const usageLine = /^Current (session|week \((.+)\)): (\d{1,3})% used(?: · resets (.+))?$/;
const resetPattern =
  /^(?:([A-Z][a-z]{2}) (\d{1,2}), (?:(\d{4}), )?)?(\d{1,2})(?::(\d{2}))?(am|pm) \(([^()]+)\)$/;
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const dayMs = 86_400_000;

function hourOf24(hour12: number, half: string): number {
  const base = hour12 % 12;
  return half === "pm" ? base + 12 : base;
}

/**
 * The instant a reset text names, read at `readAtMs`. Claude Code leaves out
 * the year when it is the reader's current year, and prints only the time when
 * the reset is within a day; then the reset is the next time the clock shows it.
 */
export function resetInstant(text: string, readAtMs: number): number | undefined {
  const match = resetPattern.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, monthName, day, year, hour, minute, half, timeZone] = match;
  if (hour === undefined || half === undefined || timeZone === undefined) {
    return undefined;
  }
  try {
    const today = wallTimeAt(readAtMs, timeZone);
    const clock = { hour: hourOf24(Number(hour), half), minute: Number(minute ?? "0") };
    if (monthName === undefined || day === undefined) {
      const sameDay = instantOf({ ...today, ...clock }, timeZone);
      return sameDay >= readAtMs ? sameDay : instantOf(nextDay(today, clock), timeZone);
    }
    const month = monthNames.indexOf(monthName) + 1;
    if (month === 0) {
      return undefined;
    }
    const wall: WallTime = { year: Number(year ?? today.year), month, day: Number(day), ...clock };
    return instantOf(wall, timeZone);
  } catch (error) {
    if (error instanceof RangeError) {
      // An unknown time zone name: the reset stays unread, the percentage still counts.
      return undefined;
    }
    throw error;
  }
}

function nextDay(today: WallTime, clock: Pick<WallTime, "hour" | "minute">): WallTime {
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day) + dayMs);
  return {
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
    ...clock,
  };
}

function windowOf(line: string, readAtMs: number): UsageWindow | undefined {
  const match = usageLine.exec(line.trim());
  if (match === null) {
    return undefined;
  }
  const [, title, inBrackets, percent, resetText] = match;
  const model = title === "session" || inBrackets === "all models" ? undefined : inBrackets;
  let kind: WindowKind = "week-model";
  if (title === "session") {
    kind = "session";
  } else if (model === undefined) {
    kind = "week";
  }
  const reset = resetText === undefined ? undefined : resetInstant(resetText, readAtMs);
  return {
    kind,
    model,
    usedPercent: Number(percent),
    resetsAt: reset === undefined ? undefined : new Date(reset).toISOString(),
    resetText,
  };
}

/**
 * Every limit window in a seat's `/usage` text, read at `readAt` (ISO).
 * Lines it doesn't know are skipped; text with no window at all is
 * `unreadable`, so the seat shows an error instead of an empty reading.
 */
export function parseUsage(text: string, readAt: string): UsageReading {
  const readAtMs = Date.parse(readAt);
  const windows = text
    .split(/\r?\n/)
    .map((line) => windowOf(line, readAtMs))
    .filter((window) => window !== undefined);
  if (windows.length === 0) {
    return { kind: "unreadable", at: readAt, why: "no usage line in the output" };
  }
  return { kind: "read", at: readAt, windows };
}
