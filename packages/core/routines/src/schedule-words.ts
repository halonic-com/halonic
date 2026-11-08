/**
 * Small building blocks for writing a schedule in words. Shared by the cron
 * description and, later, the interval description, so both read the same.
 */

/**
 * "Every minute" for one, "Every 10 minutes" for more.
 *
 * @example
 * everyCount(1, "day"); // "Every day"
 * everyCount(15, "minute"); // "Every 15 minutes"
 */
export function everyCount(count: number, unit: string): string {
  return count === 1 ? `Every ${unit}` : `Every ${count} ${unit}s`;
}

/** A two-digit number, such as `05`. */
export function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A 24-hour clock time.
 *
 * @example
 * clockTime(8, 0); // "08:00"
 */
export function clockTime(hour: number, minute: number): string {
  return `${twoDigits(hour)}:${twoDigits(minute)}`;
}
