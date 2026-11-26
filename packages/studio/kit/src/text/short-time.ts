const dayInMs = 24 * 60 * 60 * 1000;

/**
 * When something happened, as short as a list row can say it (HAL-19536 item 4): "09:41" today,
 * "Yesterday", the weekday within the last week ("Mon"), the day and month this year ("26 Nov"),
 * else the short date ("26/11/2025"). Each part follows `locale` (the runtime's own when it's
 * undefined), so a 12-hour locale reads "9:41 AM" and a month-first one "Nov 26". "Yesterday" is
 * in English, the language of the Studio's words. A time later than `now` reads as its day.
 *
 * @example
 * shortTime(new Date(2026, 10, 25, 18, 2), new Date(2026, 10, 26, 9, 41), "en-GB"); // "Yesterday"
 */
export function shortTime(at: Date, now: Date, locale?: string): string {
  const daysAgo = calendarDaysBetween(at, now);
  // The locale's own short time: "09:41" for en-GB, "9:41 AM" for en-US.
  if (daysAgo === 0) return format(at, locale, { timeStyle: "short" });
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return format(at, locale, { weekday: "short" });
  if (at.getFullYear() === now.getFullYear()) {
    return format(at, locale, { day: "numeric", month: "short" });
  }
  return format(at, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * The full date and time a short time shows on hover: "Thursday, 26 November 2026 at 09:41" for
 * `en-GB`.
 */
export function fullTime(at: Date, locale?: string): string {
  return format(at, locale, { dateStyle: "full", timeStyle: "short" });
}

function format(at: Date, locale: string | undefined, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(at);
}

/** Whole local calendar days from `at` to `now`; rounded, so a daylight-saving day still counts as one. */
function calendarDaysBetween(at: Date, now: Date): number {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((end - start) / dayInMs);
}
