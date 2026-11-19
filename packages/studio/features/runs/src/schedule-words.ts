/** How Started by names a routine's schedule, on the row and to a screen reader. */
export const scheduleWords = {
  /** The routine's schedule, in `halonic routines`' words: "Schedule · weekdays at 08:00". */
  startedBy: (when: string | undefined) =>
    when === undefined ? "Schedule" : `Schedule · ${midSentence(when)}`,
  /** Spoken: "Started by the schedule for Mondays at 09:00". */
  rowLabel: (when: string | undefined) =>
    when === undefined ? "the schedule" : `the schedule for ${midSentence(when)}`,
};

/** The day names a schedule can start with ("Mondays, Fridays at 07:30"). */
const DAY_NAME = /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days\b/;

/**
 * A schedule's words as they read after "Schedule ·": the first letter goes
 * lowercase ("weekdays at 08:00", "every 15 minutes"), but a day name keeps
 * its capital ("Mondays at 09:00") (HAL-13067).
 */
function midSentence(when: string): string {
  if (DAY_NAME.test(when)) return when;
  return `${when.charAt(0).toLowerCase()}${when.slice(1)}`;
}
