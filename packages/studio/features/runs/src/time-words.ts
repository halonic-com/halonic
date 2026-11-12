// Times and durations as the Runs feature writes them, the same way
// `halonic runs` does (cli-output 1.5 and 3.4), in the computer's own time
// zone.

const secondInMs = 1000;
const minuteInSeconds = 60;
const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const shortMonths = [
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
] as const;

/**
 * How long something took: whole seconds under a minute, then minutes and
 * seconds, or whole minutes when the seconds are 0. Rounded down, and never
 * under "1 s"; no hours, so a long run reads "75 min".
 *
 * @example
 * tookWords(18_900); // "18 s"
 * tookWords(347_000); // "5 min 47 s"
 * tookWords(360_000); // "6 min"
 */
export function tookWords(ms: number): string {
  const seconds = Math.max(1, Math.floor(ms / secondInMs));
  if (seconds < minuteInSeconds) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / minuteInSeconds);
  const rest = seconds % minuteInSeconds;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/**
 * When something is due: the time today, "tomorrow" and the time, or the
 * day and month and the time.
 *
 * @example
 * dueWords(new Date(2026, 10, 9, 14, 0), new Date(2026, 10, 9, 10, 40)); // "14:00"
 * dueWords(new Date(2026, 10, 10, 8, 0), new Date(2026, 10, 9, 10, 40)); // "tomorrow 08:00"
 * dueWords(new Date(2026, 11, 3, 8, 0), new Date(2026, 10, 9, 10, 40)); // "3 Dec 08:00"
 */
export function dueWords(due: Date, now: Date): string {
  const time = clockTime(due);
  if (sameDay(due, now)) {
    return time;
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameDay(due, tomorrow)) {
    return `tomorrow ${time}`;
  }
  return `${due.getDate()} ${shortMonths[due.getMonth()]} ${time}`;
}

/**
 * The day a run started, as the Runs list's day headings name it: "Today",
 * "Yesterday", then the weekday and date, with the year when it isn't this
 * year's.
 *
 * @example
 * dayWords(new Date(2026, 10, 6, 9, 0), new Date(2026, 10, 9, 10, 40)); // "Fri 6 Nov"
 * dayWords(new Date(2025, 11, 30, 9, 0), new Date(2026, 10, 9, 10, 40)); // "Tue 30 Dec 2025"
 */
export function dayWords(day: Date, now: Date): string {
  if (sameDay(day, now)) {
    return "Today";
  }
  if (sameDay(day, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) {
    return "Yesterday";
  }
  const date = `${shortDays[day.getDay()]} ${day.getDate()} ${shortMonths[day.getMonth()]}`;
  return day.getFullYear() === now.getFullYear() ? date : `${date} ${day.getFullYear()}`;
}

/** The time of day, "09:05". */
export function clockTime(moment: Date): string {
  const hours = String(moment.getHours()).padStart(2, "0");
  const minutes = String(moment.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
