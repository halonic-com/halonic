// Dates as the output writes them: the day and the short month, "3 Nov"
// (cli-output 3.4 and 3.5). The runs list and the trust check share them.

/** A day of the year. */
export interface CalendarDay {
  readonly day: number;
  /** 1 for January to 12 for December. */
  readonly month: number;
}

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

/** "3 Nov". */
export function dayInWords(date: CalendarDay): string {
  return `${date.day} ${shortMonths[date.month - 1] ?? ""}`;
}

/** The day of a moment in the computer's own time zone. */
export function localDay(moment: Date): CalendarDay {
  return { day: moment.getDate(), month: moment.getMonth() + 1 };
}
