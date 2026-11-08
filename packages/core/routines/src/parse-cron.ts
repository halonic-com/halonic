import { CronError } from "./cron-error.ts";
import { parseCronField } from "./cron-field.ts";

/**
 * A parsed five-field cron expression (minute hour day-of-month month
 * day-of-week). Weekdays count from 0 = Sunday; 7 also means Sunday, so a
 * set holding 7 holds 0 too.
 */
export interface Cron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  /**
   * Day-of-month and day-of-week were both restricted. As in classic cron, a
   * day then matches when it matches either one.
   */
  dayOr: boolean;
  /** Day-of-month was a bare `*`. */
  daysAny: boolean;
  /** Day-of-week was a bare `*`. */
  weekdaysAny: boolean;
}

const MACROS: Readonly<Record<string, string>> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Parses a five-field cron expression or a macro (`@hourly`, `@daily`,
 * `@midnight`, `@weekly`, `@monthly`, `@yearly`, `@annually`). Fields take
 * `*`, values, ranges, steps and comma lists; months and weekdays also take
 * three-letter English names in any case.
 *
 * @throws {CronError} with a readable message when the expression is malformed
 *
 * @example
 * parseCron("*\/15 8-18/2 * jan,dec mon-fri").hours; // Set {8, 10, 12, 14, 16, 18}
 */
export function parseCron(expression: string): Cron {
  const trimmed = expression.trim();
  const text = expandMacro(trimmed);
  if (text.startsWith("@")) {
    // Without this, "@reboot" would be reported as "got 1 field".
    throw new CronError(`Unknown macro "${text}"; use one of ${Object.keys(MACROS).join(", ")}`);
  }
  const fields = text.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronError(
      `Cron needs 5 fields (minute hour day month weekday), got ${fields.length}`,
    );
  }
  // The length check above guarantees all five are strings.
  const [minute, hour, day, month, weekday] = fields as [string, string, string, string, string];

  // Parsed left to right, so the first bad field is the one reported.
  const minutes = parseCronField(minute, { min: 0, max: 59 });
  const hours = parseCronField(hour, { min: 0, max: 23 });
  const days = parseCronField(day, { min: 1, max: 31 });
  const months = parseCronField(month, { min: 1, max: 12, names: MONTH_NAMES, firstNameValue: 1 });
  const weekdays = parseCronField(weekday, { min: 0, max: 7, names: WEEKDAY_NAMES });
  if (weekdays.values.has(7)) weekdays.values.add(0);
  return {
    minutes: minutes.values,
    hours: hours.values,
    days: days.values,
    months: months.values,
    weekdays: weekdays.values,
    dayOr: !days.any && !weekdays.any,
    daysAny: days.any,
    weekdaysAny: weekdays.any,
  };
}

/** Returns the five fields a macro stands for, or the text itself when it is no macro. */
function expandMacro(text: string): string {
  const key = text.toLowerCase();
  // An own-property check, so "constructor" or "__proto__" never reach Object.prototype.
  return Object.hasOwn(MACROS, key) ? (MACROS[key] ?? text) : text;
}
