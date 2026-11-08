import { type Cron, parseCron } from "./parse-cron.ts";
import { clockTime, everyCount, twoDigits } from "./schedule-words.ts";

const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** `*\/10`: a step over the whole minute field. */
const MINUTE_STEP = /^\*\/(\d+)$/;

/**
 * Writes a cron expression out in words for people, such as
 * "Weekdays at 08:00". Common shapes get a short phrase: every n minutes,
 * hourly, daily, weekdays, weekends, named weekdays and one day of the month.
 * Anything else comes back as `Cron "<expression>"`.
 *
 * The time zone is not part of the expression, so the caller adds it.
 *
 * @throws {CronError} when the expression is malformed, as `parseCron` does
 *
 * @example
 * describeCron("0 8 * * 1-5"); // "Weekdays at 08:00"
 * describeCron("0 8 1-7 * 1"); // 'Cron "0 8 1-7 * 1"'
 */
export function describeCron(expression: string): string {
  const cron = parseCron(expression);
  const fallback = `Cron "${expression}"`;

  const minuteStep = wholeMinuteStep(expression);
  if (minuteStep !== null) return everyCount(minuteStep, "minute");

  const minute = onlyValue(cron.minutes);
  const hour = onlyValue(cron.hours);
  const everyMonth = cron.months.size === 12;
  const everyDay = cron.daysAny && cron.weekdaysAny;

  if (minute !== null && cron.hours.size === 24 && everyDay && everyMonth) {
    return `Hourly at :${twoDigits(minute)}`;
  }
  if (minute === null || hour === null || !everyMonth) return fallback;

  const at = `at ${clockTime(hour, minute)}`;
  if (everyDay) return `Daily ${at}`;
  if (cron.daysAny) return `${weekdaysInWords(cron)} ${at}`;
  if (cron.weekdaysAny) {
    const day = onlyValue(cron.days);
    if (day !== null) return `Monthly on day ${day} ${at}`;
  }
  // Both day fields are restricted (either one matches): no short phrase.
  return fallback;
}

/**
 * The step n when the expression is written `*\/n * * * *`. Read from the
 * text, because the parsed minutes alone can't tell `*\/10` from `0,10,20,…`.
 */
function wholeMinuteStep(expression: string): number | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, ...rest] = fields;
  const step = MINUTE_STEP.exec(minute ?? "");
  if (step === null || !rest.every((field) => field === "*")) return null;
  return Number(step[1]);
}

/** "Weekdays", "Weekends", or the named days such as "Mondays, Fridays". */
function weekdaysInWords(cron: Cron): string {
  // 7 is a second name for Sunday, and the parser already added 0 for it.
  const days = [...cron.weekdays].filter((day) => day !== 7).sort((a, b) => a - b);
  const key = days.join();
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  return days.map((day) => DAY_NAMES[day]).join(", ");
}

/** The value of a set with exactly one value, otherwise null. */
function onlyValue(values: Set<number>): number | null {
  if (values.size !== 1) return null;
  const [value] = values;
  return value ?? null;
}
