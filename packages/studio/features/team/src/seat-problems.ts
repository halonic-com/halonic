import type { Seat, SeatWindow } from "@halonicjs/ports";

/** What is wrong with a seat, worst first in this order. */
export type SeatProblemKind =
  | "full"
  | "signed-out"
  | "not-read"
  | "reaches-90-soon"
  | "at-90"
  | "at-80";

/** One seat's worst problem now (requirement `team.seat-problems`). */
export interface SeatProblem {
  readonly kind: SeatProblemKind;
  readonly seat: Seat;
  /** The seat's week window, when it has one. */
  readonly week: SeatWindow | undefined;
  /** Only an 80% seat is quiet: an Inbox notice, no notification and no sidebar count (Choice S3). */
  readonly quiet: boolean;
}

const order: readonly SeatProblemKind[] = [
  "full",
  "signed-out",
  "not-read",
  "reaches-90-soon",
  "at-90",
  "at-80",
];
const minuteMs = 60 * 1000;
/** A seat not read for this long is a problem, whatever its last reading said. */
export const notReadAfterMs = 30 * minuteMs;
/** A forecast to cross 90% within this long is a problem now. */
const soonMs = 60 * minuteMs;

/**
 * Each seat's worst problem, worst first: full, signed out, not read (or not
 * read for 30 minutes), reaching 90% of its week within an hour, at 90% of
 * its week, then at 80%. A seat with none is left out. These are team rules
 * (Choice S2: 80% and 90%), kept out of the port because they change more
 * often than the data.
 */
export function seatProblems(seats: readonly Seat[], now: Date): readonly SeatProblem[] {
  const found: SeatProblem[] = [];
  for (const seat of seats) {
    const week = seat.windows.find((window) => window.kind === "week");
    const kind = worstProblem(seat, week, now);
    if (kind !== undefined) found.push({ kind, seat, week, quiet: kind === "at-80" });
  }
  return found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

function worstProblem(
  seat: Seat,
  week: SeatWindow | undefined,
  now: Date,
): SeatProblemKind | undefined {
  if (seat.state === "full") return "full";
  if (seat.state === "signed-out") return "signed-out";
  const age = now.getTime() - Date.parse(seat.asOf);
  if (seat.state === "not-read" || age >= notReadAfterMs) return "not-read";
  if (week === undefined) return undefined;
  if (week.usedPercent >= 90) return "at-90";
  if (week.reaches90At !== undefined && Date.parse(week.reaches90At) - now.getTime() <= soonMs) {
    return "reaches-90-soon";
  }
  return week.usedPercent >= 80 ? "at-80" : undefined;
}
