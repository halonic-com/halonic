import { pageWords } from "../page/page-words.ts";

/** The Routines list's words (microcopy 12.1, flow-routines 2.1). */
export const listWords = {
  title: "Routines",
  sentence: "A routine starts a workflow on its own: on a schedule or every so often.",
  emptySentence: "A routine starts a workflow on its own, for example every weekday at 8.",
  searchLabel: "Search routines",
  loadingLabel: "Loading routines",
  chipsLabel: "Hub",
  allChip: "All",
  loadFailedTitle: "Couldn't load routines",
  tryAgain: "Try again",
  tryingAgain: "Trying again…",
  newRoutine: "New routine",
  nothingYetTitle: "No routines yet",
  emptyHub: (hubName: string) => `No routines in ${hubName} yet.`,
  noMatch: (query: string) => `No routines match "${query}".`,
  /** Read after a search or a hub change (HAL-14241). */
  shownCount: (count: number) => (count === 1 ? "1 routine." : `${count} routines.`),
  more: (name: string) => `More actions for ${name}`,
  off: "Off",
  needsSignIn: "Needs sign-in again",
  needsYou: "Needs you",
  pausedUntilTrusted: "Paused until trusted",
  /**
   * After the row's summary while its saved changes aren't live, in the page's words, so the row's
   * live summary doesn't read as a lost change (HAL-15485).
   */
  changesNotLive: pageWords.changesNotLive,
  /**
   * After the row's summary in place of the next time, while a routine that is on was never live,
   * since the scheduler doesn't start it; the CLI's Next column says the same (HAL-15667).
   */
  notLiveYet: "Not live yet",
} as const;

/** The words of a routine's ⋮ menu and of deleting it: no dialog, and Undo; there is no trash, saving deletes the file (flow-routines 2.4, microcopy 12.3). */
export const rowMenuWords = {
  open: "Open",
  openInNewTab: "Open in new tab",
  delete: "Delete",
  undo: "Undo",
  /** The toast's title; it ends with a full stop because a second line follows. */
  moved: (name: string) => `Deleted ${name}.`,
  /** The toast's second line: what deleting stops, and what it leaves alone. */
  movedLine: (targetName: string) =>
    `It won't start ${targetName} any more. Runs it already started keep going.`,
  couldntMove: (name: string, reason: string | undefined) =>
    reason === undefined
      ? `Couldn't delete ${name}.`
      : `Couldn't delete ${name}: ${reason.replace(/\.$/, "")}.`,
  couldntUndo: (name: string) => `Couldn't put ${name} back`,
  tryAgain: "Try again",
} as const;

/** The search and command words (microcopy 12.1). */
export const searchWords = {
  title: "Routines",
  detail: (hubName: string) => `Routine · ${hubName}`,
} as const;

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

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

/** A day from a week away on: "Fri 20 Nov", with the year when it isn't this year's. */
const dateOf = (moment: Date, now: Date): string => {
  const date = `${shortDays[moment.getDay()]} ${moment.getDate()} ${shortMonths[moment.getMonth()]}`;
  return moment.getFullYear() === now.getFullYear() ? date : `${date} ${moment.getFullYear()}`;
};

/**
 * When a routine's newest due time was refused, for its row in place of the next time: "couldn't
 * start today 19:41", then "couldn't start yesterday 19:41", "couldn't start Mon 19:41" within the
 * week and the date after that, with the year when it isn't this year's, as the next time reads
 * (C552-5, HAL-15269; C617-2, HAL-15716).
 */
export function refusedWhen(iso: string, now: Date): string {
  const moment = new Date(iso);
  const clock = `${String(moment.getHours()).padStart(2, "0")}:${String(moment.getMinutes()).padStart(2, "0")}`;
  const ago = daysBetween(moment, now);
  if (ago <= 0) return `couldn't start today ${clock}`;
  if (ago === 1) return `couldn't start yesterday ${clock}`;
  const day = shortDays[moment.getDay()];
  if (ago < 7) return `couldn't start ${day} ${clock}`;
  return `couldn't start ${dateOf(moment, now)} ${clock}`;
}

/**
 * When a routine next starts, for its row: "next today 07:30", "next tomorrow 07:30", "next Mon
 * 07:30" within the week, then the date ("next Fri 20 Nov 07:30"), with the year when it isn't this
 * year's.
 */
export function nextWhen(iso: string, now: Date): string {
  const moment = new Date(iso);
  const clock = `${String(moment.getHours()).padStart(2, "0")}:${String(moment.getMinutes()).padStart(2, "0")}`;
  const ahead = daysBetween(now, moment);
  if (ahead <= 0) return `next today ${clock}`;
  if (ahead === 1) return `next tomorrow ${clock}`;
  const day = shortDays[moment.getDay()];
  if (ahead < 7) return `next ${day} ${clock}`;
  return `next ${dateOf(moment, now)} ${clock}`;
}
