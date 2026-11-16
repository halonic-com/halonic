import type { Version } from "./api.ts";
import { historyWords } from "./changes-words.ts";

/** One day of History: its heading, and the versions recorded on it, newest first. */
export interface HistoryDay {
  /** The calendar day, "2026-11-12", in the computer's time zone. */
  readonly id: string;
  /** "Today", "Yesterday", "12 November", or "12 November 2025" in an earlier year. */
  readonly heading: string;
  readonly versions: readonly Version[];
}

const dayHeading = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
const dayHeadingWithYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function dayId(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The time of day a version was recorded, as "10:40". */
export function timeOfDay(at: number): string {
  return clock.format(new Date(at));
}

/** The day and time a version was recorded: "12 November 2026, 10:40". */
export function fullDate(at: number): string {
  return `${dayHeadingWithYear.format(new Date(at))}, ${timeOfDay(at)}`;
}

/** Groups versions (already newest first) by the calendar day they were recorded on. */
export function groupByDay(versions: readonly Version[], now: Date): HistoryDay[] {
  const today = dayId(now);
  const yesterday = dayId(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const days: { id: string; heading: string; versions: Version[] }[] = [];
  for (const version of versions) {
    const date = new Date(version.at);
    const id = dayId(date);
    let day = days.at(-1);
    if (day?.id !== id) {
      let heading = dayHeading.format(date);
      if (id === today) heading = historyWords.today;
      else if (id === yesterday) heading = historyWords.yesterday;
      else if (date.getFullYear() !== now.getFullYear()) heading = dayHeadingWithYear.format(date);
      day = { id, heading, versions: [] };
      days.push(day);
    }
    day.versions.push(version);
  }
  return days;
}
