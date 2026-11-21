/** The Routines list's words (microcopy 12.1, flow-routines 2.1). */
export const listWords = {
  title: "Routines",
  sentence: "A routine starts a workflow or an agent on its own: on a schedule or every so often.",
  emptySentence:
    "A routine starts a workflow or an agent on its own, for example every weekday at 8.",
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
  more: (name: string) => `More actions for ${name}`,
  cantStart: "Can't start",
  /** Read after "Can't start" by screen readers only, so the row's name says why (HAL-14940). */
  cantStartWhy: (targetName: string) => `${targetName} isn't in this workspace`,
  off: "Off",
  needsSignIn: "Needs sign-in again",
  needsYou: "Needs you",
  pausedUntilTrusted: "Paused until trusted",
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
  const date = `${day} ${moment.getDate()} ${shortMonths[moment.getMonth()]}`;
  const shown =
    moment.getFullYear() === now.getFullYear() ? date : `${date} ${moment.getFullYear()}`;
  return `next ${shown} ${clock}`;
}
