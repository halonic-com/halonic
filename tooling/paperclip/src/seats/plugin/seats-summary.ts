import type { SeatId, SeatRole } from "../records.ts";
import type { SeatRow, SeatsPage, WindowRow } from "./seats-page.ts";

/**
 * What `GET /seats/summary` answers: the seats as Studio's Team screens and
 * the phone show them (phase 2 architecture, section 1.5, the `Seat` shape of
 * the `TeamStatus` port). It is built from the page's data, which already
 * leaves out a seat's folder, account and connection id, and it names its
 * fields one by one, so a field added to the page later never leaks into it.
 */
export interface SeatsSummary {
  /** When the plugin built the answer. */
  readonly asOf: string;
  readonly seats: readonly SeatSummary[];
  /** What `seats.check` would propose now, in words; undefined when nothing. It moves no one. */
  readonly proposal: { readonly text: string; readonly at: string } | undefined;
}

/** One seat, by its board label only. */
export interface SeatSummary {
  readonly id: SeatId;
  /** The seat's id as the board named it in the settings. */
  readonly label: string;
  readonly role: SeatRole;
  readonly state: SeatSummaryState;
  /** When its newest reading was taken; undefined before the first. */
  readonly readAt: string | undefined;
  readonly windows: readonly WindowSummary[];
  /** The names of the agents on the seat now. */
  readonly agents: readonly string[];
  readonly manualReset: "available" | "used" | "none";
}

export type SeatSummaryState = "ok" | "near-limit" | "full" | "signed-out" | "not-read";

/** One usage window of a seat. */
export interface WindowSummary {
  readonly kind: "five-hour" | "week";
  readonly label: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
  /** When it crosses 90% at today's rate, if before its reset. */
  readonly reaches90At: string | undefined;
}

const nearLimitPercent = 80;
const fullPercent = 100;

/** Builds the summary from the page's data and the proposal text. Pure: it reads nothing. */
export function seatsSummary(page: SeatsPage, proposalText: string | undefined): SeatsSummary {
  return {
    asOf: page.at,
    seats: page.seats.map((row) => seatSummary(row, page.at)),
    proposal: proposalText === undefined ? undefined : { text: proposalText, at: page.at },
  };
}

function seatSummary(row: SeatRow, at: string): SeatSummary {
  const windows = [
    windowSummary("five-hour", "5-hour window", row.session),
    windowSummary("week", "Week", row.week),
  ].filter((window) => window !== undefined);
  return {
    id: row.seatId,
    label: row.seatId,
    role: row.role,
    state: seatState(row, windows),
    readAt: readAt(row, at),
    windows,
    agents: row.agents.map((agent) => agent.name),
    manualReset: manualReset(row),
  };
}

function windowSummary(
  kind: WindowSummary["kind"],
  label: string,
  window: WindowRow | undefined,
): WindowSummary | undefined {
  if (window === undefined) {
    return undefined;
  }
  return {
    kind,
    label,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt,
    reaches90At: window.reaches90At,
  };
}

function seatState(row: SeatRow, windows: readonly WindowSummary[]): SeatSummaryState {
  if (row.lastError === "signed-out") {
    return "signed-out";
  }
  if (!row.readable) {
    return "not-read";
  }
  const highest = Math.max(0, ...windows.map((window) => window.usedPercent));
  if (highest >= fullPercent) {
    return "full";
  }
  return highest >= nearLimitPercent ? "near-limit" : "ok";
}

function readAt(row: SeatRow, at: string): string | undefined {
  if (row.readingAgeMinutes === undefined) {
    return undefined;
  }
  return new Date(Date.parse(at) - row.readingAgeMinutes * 60_000).toISOString();
}

/** A paid-API seat has no subscription window to reset. */
function manualReset(row: SeatRow): SeatSummary["manualReset"] {
  if (row.role === "paid-api") {
    return "none";
  }
  return row.manualResetUsed ? "used" : "available";
}
