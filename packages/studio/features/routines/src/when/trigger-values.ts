import type { RoutineTrigger } from "../api.ts";

/** The days of the week as the chips show them, Monday first, with cron's number for each (Sunday is 0). */
export const WEEK_DAYS = [
  { cron: 1, label: "Mo", name: "Monday" },
  { cron: 2, label: "Tu", name: "Tuesday" },
  { cron: 3, label: "We", name: "Wednesday" },
  { cron: 4, label: "Th", name: "Thursday" },
  { cron: 5, label: "Fr", name: "Friday" },
  { cron: 6, label: "Sa", name: "Saturday" },
  { cron: 0, label: "Su", name: "Sunday" },
] as const;

/** A schedule the day chips can show: one time on some days of the week. */
export interface SimpleSchedule {
  /** Cron's day numbers, 0 to 6 with Sunday as 0; never empty. */
  readonly days: ReadonlySet<number>;
  readonly hour: number;
  readonly minute: number;
}

/** What a macro means as five fields, for the three that count as simple. */
const SIMPLE_MACROS: Readonly<Record<string, string>> = {
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
};

const NUMBER = /^\d+$/;

/** The days one part of a weekday field names (`3`, `1-5`), Sunday as 0; `undefined` when it is anything else. */
function daysOfPart(part: string): readonly number[] | undefined {
  const [from = "", to = from, ...rest] = part.split("-");
  if (rest.length > 0 || !NUMBER.test(from) || !NUMBER.test(to)) return undefined;
  const first = Number(from);
  const last = Number(to);
  if (first > last || last > 7) return undefined;
  const days: number[] = [];
  for (let day = first; day <= last; day++) days.push(day === 7 ? 0 : day);
  return days;
}

/** The day numbers a weekday field names (`1-5`, `0,6`, `*`), or `undefined` when it isn't a list of days and ranges. */
function weekdaysOf(field: string): ReadonlySet<number> | undefined {
  const days = new Set<number>();
  for (const part of field === "*" ? ["0-6"] : field.split(",")) {
    const named = daysOfPart(part);
    if (named === undefined) return undefined;
    for (const day of named) days.add(day);
  }
  return days;
}

/** A whole number in `0..max` from `text`, or `undefined`. */
function numberUpTo(text: string, max: number): number | undefined {
  if (!NUMBER.test(text)) return undefined;
  const value = Number(text);
  return value <= max ? value : undefined;
}

/**
 * The schedule the day chips can show, or `undefined` when the cron is more detailed than them:
 * minute and hour are single numbers, day-of-month and month are `*`, and the weekday is a list of
 * days. Weekday 7 reads as Sunday; `@daily`, `@midnight` and `@weekly` count as simple.
 */
export function simpleSchedule(cron: string): SimpleSchedule | undefined {
  const fields = (SIMPLE_MACROS[cron.trim()] ?? cron).trim().split(/\s+/);
  const [minuteText, hourText, dayOfMonth, month, weekday] = fields;
  if (fields.length !== 5) return undefined;
  if (dayOfMonth !== "*" || month !== "*") return undefined;
  const minute = numberUpTo(minuteText ?? "", 59);
  const hour = numberUpTo(hourText ?? "", 23);
  const days = weekdaysOf(weekday ?? "");
  if (minute === undefined || hour === undefined || days === undefined) return undefined;
  return { days, hour, minute };
}

/** The weekday field for these days, the shortest way: `*` for all, `1-5` for a run of three or more, else a list. */
function weekdayField(days: ReadonlySet<number>): string {
  if (days.size === 7) return "*";
  const sorted = [...days].sort((a, b) => a - b);
  const parts: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    let end = index;
    while (sorted[end + 1] === (sorted[end] ?? 0) + 1) end++;
    const first = sorted[index];
    const last = sorted[end];
    parts.push(end - index >= 2 ? `${first}-${last}` : sorted.slice(index, end + 1).join(","));
    index = end + 1;
  }
  return parts.join(",");
}

/** The five-field cron line for a simple schedule: Mo–Fr 07:30 is `30 7 * * 1-5`. */
export function cronFor({ days, hour, minute }: SimpleSchedule): string {
  return `${minute} ${hour} * * ${weekdayField(days)}`;
}

/** `"07:30"` for the time field, from an hour and a minute. */
export function timeText(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** The hour and minute a time field holds (`"07:30"`), or `undefined` while it is empty or half typed. */
export function readTime(text: string): { hour: number; minute: number } | undefined {
  const match = /^(\d{2}):(\d{2})/.exec(text);
  const hour = match?.[1] === undefined ? undefined : numberUpTo(match[1], 23);
  const minute = match?.[2] === undefined ? undefined : numberUpTo(match[2], 59);
  return hour === undefined || minute === undefined ? undefined : { hour, minute };
}

/** The units an interval is written in, as the engine reads them. */
export const EVERY_UNITS = ["m", "h", "d"] as const;
export type EveryUnit = (typeof EVERY_UNITS)[number];

/** An `every` interval split into what the two fields show. */
export interface EveryInterval {
  readonly count: number;
  readonly unit: EveryUnit;
}

/** The count and unit of `15m`, `2h` or `1d`; `undefined` for anything the engine would refuse (`1.5h`, `0m`, `07m`). */
export function readInterval(text: string): EveryInterval | undefined {
  const match = /^([1-9]\d{0,4})(m|h|d)$/.exec(text.trim());
  if (match?.[1] === undefined) return undefined;
  return { count: Number(match[1]), unit: match[2] as EveryUnit };
}

/** The interval text for a count and a unit: `2h`. */
export function intervalText({ count, unit }: EveryInterval): string {
  return `${count}${unit}`;
}

/** The signal name picking On a signal starts with. */
export const DEFAULT_SIGNAL = "mail.tagged";

/** The trigger kinds the picker can switch to, in the order it lists them. */
export const PICKABLE_KINDS = ["manual", "schedule", "every", "signal"] as const;
export type PickableKind = (typeof PICKABLE_KINDS)[number];

/**
 * What picking a kind writes: manual, weekdays at 08:00 in the device's zone (no zone when it
 * can't be read), every hour, or the signal `mail.tagged`.
 */
export function defaultTrigger(kind: PickableKind, deviceZone: string | undefined): RoutineTrigger {
  switch (kind) {
    case "manual":
      return { kind: "manual" };
    case "schedule":
      return {
        kind: "schedule",
        cron: "0 8 * * 1-5",
        ...(deviceZone !== undefined && { timeZone: deviceZone }),
      };
    case "every":
      return { kind: "every", interval: "1h" };
    case "signal":
      return { kind: "signal", name: DEFAULT_SIGNAL };
  }
}
