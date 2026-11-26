const dayInMs = 24 * 60 * 60 * 1000;

/**
 * When something happened, as short as a list row can say it (HAL-19536 item 4): "09:41" today,
 * "Yesterday", the weekday within the last week ("Mon"), the day and month this year ("26 Nov"),
 * else the short date ("26/11/2025"). Each part is in English, the language of the Studio's words,
 * written the way `locale`'s region writes it (the runtime's own when it's undefined), so one line
 * never mixes languages (HAL-19540): en-US reads "9:41 AM" and "Nov 26", de-DE reads "09:41" and
 * "26 Nov", never "26. Nov.". A time later than `now` reads as its day. Days and times are the
 * computer's own unless `timeZone` (an IANA zone such as "UTC") says otherwise.
 *
 * @example
 * shortTime(new Date(2026, 10, 25, 18, 2), new Date(2026, 10, 26, 9, 41), "en-GB"); // "Yesterday"
 */
export function shortTime(at: Date, now: Date, locale?: string, timeZone?: string): string {
  const atDay = calendarDay(at, timeZone);
  const nowDay = calendarDay(now, timeZone);
  const daysAgo = Math.round((nowDay.start - atDay.start) / dayInMs);
  // The locale's own short time: "09:41" for en-GB, "9:41 AM" for en-US.
  if (daysAgo === 0) return format(at, locale, { timeStyle: "short", timeZone });
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return format(at, locale, { weekday: "short", timeZone });
  if (atDay.year === nowDay.year) {
    return format(at, locale, { day: "numeric", month: "short", timeZone });
  }
  return format(at, locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone });
}

/**
 * The full date and time a short time shows on hover: "Thursday, 26 November 2026 at 09:41" for
 * `en-GB`.
 */
export function fullTime(at: Date, locale?: string): string {
  return format(at, locale, { dateStyle: "full", timeStyle: "short" });
}

/** Each formatter by locale and options: a long list asks for the same few on every render. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function format(at: Date, locale: string | undefined, options: Intl.DateTimeFormatOptions): string {
  const english = englishFor(locale);
  const key = `${english} ${JSON.stringify(options)}`;
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

/** The English a region without English data reads in (HAL-19540). */
const fallbackEnglish = "en-GB";

/**
 * The calendar day `at` falls on in `timeZone` (the computer's own when undefined): its year, and
 * its start as a UTC midnight, so whole days between two of them divide evenly, and a
 * daylight-saving day still counts as one.
 */
function calendarDay(at: Date, timeZone: string | undefined): { year: number; start: number } {
  if (timeZone === undefined) {
    return {
      year: at.getFullYear(),
      start: Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()),
    };
  }
  const parts = dayParts(timeZone).formatToParts(at);
  const part = (type: string) => Number(parts.find((each) => each.type === type)?.value);
  return { year: part("year"), start: Date.UTC(part("year"), part("month") - 1, part("day")) };
}

/** The numeric day parts of a time zone, one formatter per zone. */
function dayParts(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone);
  if (formatter === undefined) {
    const options = { year: "numeric", month: "numeric", day: "numeric", timeZone } as const;
    formatter = new Intl.DateTimeFormat("en-US", options);
    dayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
