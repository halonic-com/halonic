const dayInMs = 24 * 60 * 60 * 1000;

/**
 * When something happened, as short as a list row can say it (HAL-19536 item 4): "09:41" today,
 * "Yesterday", the weekday within the last week ("Mon"), the day and month this year ("26 Nov"),
 * else the short date ("26/11/2025"). Each part is in English, the language of the Studio's words,
 * written the way `locale`'s region writes it (the runtime's own when it's undefined), so one line
 * never mixes languages (HAL-19540): en-US reads "9:41 AM" and "Nov 26", de-DE reads "09:41" and
 * "26 Nov", never "26. Nov.". A time later than `now` reads as its day.
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

/**
 * Each formatter by locale, options and time zone: a long list asks for the same few on every
 * render. A formatter keeps the zone it was made in, so a computer that moves to another zone
 * gets new ones, and its times keep agreeing with "Yesterday" and the weekday.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function format(at: Date, locale: string | undefined, options: Intl.DateTimeFormatOptions): string {
  const english = englishFor(locale);
  const key = `${english} ${zoneKey(at)} ${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(english, options);
    formatters.set(key, formatter);
  }
  return formatter.format(at);
}

/**
 * English as `locale`'s region writes it: "en-DE" for `de-DE`, "en-NL" for `nl` (whose likely
 * region is the Netherlands). A region Intl has no English for, such as Brazil, reads as plain
 * `en-GB`, never as another language or as US English by accident.
 */
function englishFor(locale: string | undefined): string {
  const known = englishes.get(locale);
  if (known !== undefined) return known;
  const english = englishOfRegion(locale);
  englishes.set(locale, english);
  return english;
}

/** The English each locale reads in, worked out once: see {@link englishFor}. */
const englishes = new Map<string | undefined, string>();

function englishOfRegion(locale: string | undefined): string {
  const given = new Intl.Locale(locale ?? new Intl.DateTimeFormat().resolvedOptions().locale);
  const region = given.region ?? given.maximize().region;
  if (region === undefined) return fallbackEnglish;
  const english = new Intl.Locale("en", { region }).toString();
  // Intl resolves a region it has no English data for to plain "en", which is US English.
  const resolved = new Intl.DateTimeFormat(english).resolvedOptions().locale;
  return resolved === english ? english : fallbackEnglish;
}

/**
 * The local time zone, as cheaply as it can be told apart: its offsets in January and July of
 * `at`'s year, which differ between zones that differ in summer time too.
 */
function zoneKey(at: Date): string {
  const year = at.getFullYear();
  return `${new Date(year, 0, 1).getTimezoneOffset()}/${new Date(year, 6, 1).getTimezoneOffset()}`;
}

/** The English a region without English data reads in (HAL-19540). */
const fallbackEnglish = "en-GB";

/** Whole local calendar days from `at` to `now`; rounded, so a daylight-saving day still counts as one. */
function calendarDaysBetween(at: Date, now: Date): number {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((end - start) / dayInMs);
}
