import type { RoutineRun, RoutineRunStart, RoutineSkip, RoutineSkipReason } from "../api.ts";

/** The Runs view's words (flow-routines 3.9, microcopy 12.3). */
export const runsWords = {
  tab: "Runs",
  viewsLabel: "Routine views",
  scheduleTab: "Schedule",
  now: "Now",
  earlier: "Earlier",
  loading: "Loading runs",
  loadFailedTitle: "Couldn't load runs",
  tryAgain: "Try again",
  emptyTitle: "No runs yet",
  emptyManual: "Press Run now to start one.",
  emptyAfter: (when: string) => `It runs next on ${when}, or press Run now.`,
  /** Said by a screen reader before a queued row's text; not drawn. */
  queuedPrefix: "Queued, ",
  tabNeedsYou: (count: number) => `${count} needs you`,
  tabRunning: "A run is going",
  /**
   * A run row's name, so it isn't read as its loose words ("Done 81d0ae Run now 08:39"), the way
   * the Runs list names its rows: "Run 81d0ae, done. Started: Run now, 08:39." (HAL-14241).
   */
  rowName: (shortId: string, outcome: string, startedBy: string, time: string) =>
    `Run ${shortId}, ${outcome.toLowerCase()}. Started: ${startedBy}, ${time}.`,
} as const;

/** The chip word for each outcome of a run (the Runs list's words). */
export const outcomeWords: Record<RoutineRun["outcome"], string> = {
  running: "Running",
  waiting: "Needs you",
  completed: "Done",
  failed: "Failed",
  "cant-try": "Couldn't try",
};

/** What started a run, as the row says it. */
export const startedByWords: Record<RoutineRunStart, string> = {
  schedule: "On schedule",
  "catch-up": "Caught up after sleep",
  every: "Every so often",
  mail: "New mail",
  signal: "Signal",
  webhook: "Web request",
  "run-now": "Run now",
};

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const months = [
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

const clock = (moment: Date): string =>
  `${String(moment.getHours()).padStart(2, "0")}:${String(moment.getMinutes()).padStart(2, "0")}`;

const startOfDay = (moment: Date): number =>
  new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();

const daysAgo = (moment: Date, now: Date): number =>
  Math.round((startOfDay(now) - startOfDay(moment)) / 86_400_000);

const sameDay = (first: Date, second: Date): boolean => startOfDay(first) === startOfDay(second);

/** "Mon 2 Nov": the day with its date. */
const dated = (moment: Date): string =>
  `${days[moment.getDay()]} ${moment.getDate()} ${months[moment.getMonth()]}`;

/** A time of a skip: "08:00 Tue", with the date once it is older than 6 days. */
function skipMoment(moment: Date, now: Date): string {
  const day = daysAgo(moment, now) > 6 ? dated(moment) : days[moment.getDay()];
  return `${clock(moment)} ${day}`;
}

/**
 * The time or range of times a skip or a queue covers: "08:00 Tue", "07:00 to 09:00 Tue" within
 * one day, "19:00 Fri to 08:00 Mon" over several. The end decides whether days carry a date.
 */
export function timeRange(from: string, to: string, now: Date): string {
  const first = new Date(from);
  const last = new Date(to);
  if (first.getTime() === last.getTime()) return skipMoment(last, now);
  if (sameDay(first, last)) return `${clock(first)} to ${skipMoment(last, now)}`;
  const withDate = daysAgo(last, now) > 6;
  const start = withDate
    ? `${clock(first)} ${dated(first)}`
    : `${clock(first)} ${days[first.getDay()]}`;
  return `${start} to ${skipMoment(last, now)}`;
}

const missed = "missed while Halonic was closed or asleep";

const skipReasons: Record<
  Exclude<RoutineSkipReason, "target-never-live" | "target-in-trash">,
  string
> = {
  busy: "the last run was still busy",
  missed: `${missed} (catch-up is off)`,
  latest: `${missed} (only the latest time ran)`,
  cap: `${missed} (catch-up runs 100 at most)`,
  window: `${missed} (catch-up goes back 7 days at most)`,
  changed: "dropped because the routine was changed or turned off before it started",
};

/** The one line a skipped row says: the times, then why. */
export function skipSentence(skip: RoutineSkip, targetName: string, now: Date): string {
  const when = timeRange(skip.from, skip.to, now);
  switch (skip.reason) {
    case "target-never-live":
      return `${when}: ${targetName} isn't live yet`;
    case "target-in-trash":
      return `${when}: ${targetName} was deleted`;
    default:
      return `${when}: ${skipReasons[skip.reason]}`;
  }
}

/** The line of times waiting for the previous run to end (busy rule "Queue it"). */
export function queuedSentence(
  queued: { readonly from: string; readonly to: string; readonly count: number },
  now: Date,
): string {
  const when = timeRange(queued.from, queued.to, now);
  return queued.count === 1
    ? `${when}: waiting to start when the last run is done`
    : `${when}: ${queued.count} times waiting to start, one after another`;
}

/** When a run started, for its row: "09:05" today, "yesterday", "Thu 08:12" this week, then the date. */
export function runTime(iso: string, now: Date): string {
  const moment = new Date(iso);
  const ago = daysAgo(moment, now);
  if (ago <= 0) return clock(moment);
  if (ago === 1) return "yesterday";
  if (ago < 7) return `${days[moment.getDay()]} ${clock(moment)}`;
  const date = `${moment.getDate()} ${months[moment.getMonth()]}`;
  return moment.getFullYear() === now.getFullYear() ? date : `${date} ${moment.getFullYear()}`;
}

/** A time for the empty line: "Fri 6 Nov at 07:30". */
export function nextRunWords(iso: string): string {
  const moment = new Date(iso);
  return `${dated(moment)} at ${clock(moment)}`;
}
