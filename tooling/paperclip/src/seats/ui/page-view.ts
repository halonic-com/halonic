import type { StatusBadgeVariant, TimeseriesDataPoint } from "@paperclipai/plugin-sdk/ui";
import { defaultPlacementRules } from "../placement-rules.ts";
import type { SeatRow, SeatsPage, WindowRow } from "../plugin/seats-page.ts";
import { reasonText } from "../proposal-text.ts";
import type { SeatAlertKind } from "../read/seat-watch.ts";
import type { ReadError } from "../records.ts";

/**
 * What the "AI seats" page shows, worked out from the page's data. Pure, so
 * the page component only lays it out with the SDK's own components.
 */

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const calendarHours = 7 * 24;

/** One top card. */
export interface CardView {
  readonly label: string;
  readonly value: string | number;
}

/** A seat's state as a badge. */
export interface StateView {
  readonly status: StatusBadgeVariant;
  readonly label: string;
}

/** One row of the seat table; `id` keeps the row stable for the table. */
export interface SeatRowView extends Record<string, unknown> {
  readonly id: string;
  readonly seat: string;
  readonly state: StateView;
  readonly fiveHour: string;
  readonly week: string;
  readonly agents: string;
  readonly reading: string;
  readonly signIn: string;
}

/** One proposed move. */
export interface MoveView extends Record<string, unknown> {
  readonly id: string;
  readonly agent: string;
  readonly from: string;
  readonly to: string;
  readonly why: string;
}

/** The top cards (seat forecast, section 6). Run-out time waits for the forecast (HAL-16026). */
export function cardsView(page: SeatsPage): CardView[] {
  const { cards } = page;
  const unreadable = cards.poolSeatsUnreadable;
  const refill = cards.nextRefill;
  return [
    {
      label:
        unreadable === 0
          ? "Pool points left this week"
          : `Pool points left this week (${seatCount(unreadable)} can't be read)`,
      value: Math.round(cards.poolPointsLeft),
    },
    {
      label: "Run-out time (P50 to P90)",
      value: "Comes with the seat forecast",
    },
    {
      label: "Pool use now, points per hour",
      value:
        cards.poolPointsPerHour === undefined ? "No rate yet" : round1(cards.poolPointsPerHour),
    },
    {
      label: "Next refill",
      value:
        refill === undefined
          ? "None in the next 7 days"
          : `${refill.seatId}, ${Math.round(refill.points)} points, ${untilText(page.at, refill.at)}`,
    },
  ];
}

/** One row per seat, in the settings' order. */
export function seatRowsView(page: SeatsPage): SeatRowView[] {
  return page.seats.map((seat) => ({
    id: seat.seatId,
    seat:
      seat.resetGroup === undefined
        ? `${seat.seatId} (${seat.role})`
        : `${seat.seatId} (${seat.role}, group ${seat.resetGroup})`,
    state: stateView(seat),
    fiveHour: windowText(seat.session, page.at),
    week: windowText(seat.week, page.at),
    agents: seat.agents.length === 0 ? "None" : seat.agents.map((agent) => agent.name).join(", "),
    reading: readingText(seat, page.at),
    signIn:
      seat.signInExpiresAt === undefined
        ? "Unknown"
        : `Expires ${untilText(page.at, seat.signInExpiresAt)}`,
  }));
}

/** The seat's state: a failed or old reading first, then its alerts. */
export function stateView(seat: SeatRow): StateView {
  if (!seat.readable) {
    return {
      status: "error",
      label: seat.lastError === undefined ? "No recent reading" : readErrorText[seat.lastError],
    };
  }
  if (seat.alerts.length > 0) {
    return { status: "warning", label: seat.alerts.map((kind) => alertText[kind]).join(", ") };
  }
  return { status: "ok", label: "OK" };
}

/** A window as "70% used, 80% in 30 min, 90% in 1 h, resets in 2 h". */
export function windowText(window: WindowRow | undefined, at: string): string {
  if (window === undefined) {
    return "No reading";
  }
  const parts = [`${Math.round(window.usedPercent)}% used`];
  for (const [percent, reachedAt] of [
    [80, window.reaches80At],
    [90, window.reaches90At],
  ] as const) {
    if (reachedAt === at) {
      parts.push(`past ${percent}%`);
    } else if (reachedAt !== undefined) {
      parts.push(`${percent}% ${untilText(at, reachedAt)}`);
    }
  }
  if (window.resetsAt !== undefined) {
    parts.push(`resets ${untilText(at, window.resetsAt)}`);
  }
  return parts.join(", ");
}

/**
 * Capacity coming free over the next 7 days, by hour: the weekly points
 * each pool seat gets back, in the hour its week resets.
 */
export function refillCalendar(page: SeatsPage): TimeseriesDataPoint[] {
  const start = Math.floor(Date.parse(page.at) / hourMs) * hourMs;
  const points = Array.from({ length: calendarHours }, () => 0);
  for (const refill of page.refills) {
    const hour = Math.floor((Date.parse(refill.at) - start) / hourMs);
    if (hour >= 0 && hour < calendarHours) {
      points[hour] = (points[hour] ?? 0) + refill.points;
    }
  }
  return points.map((value, hour) => ({
    timestamp: new Date(start + hour * hourMs).toISOString(),
    value: Math.round(value),
  }));
}

/** The moves `seats.check` would propose now, with the reason in numbers. */
export function movesView(page: SeatsPage): MoveView[] {
  return page.proposal.moves.map((move) => ({
    id: `${move.agent.agentId}:${move.from}`,
    agent: move.agent.name,
    from: move.from,
    to: move.to ?? "No seat can take it now",
    why: reasonText(
      move.reason,
      page.seats.find((seat) => seat.seatId === move.from),
      defaultPlacementRules,
    ),
  }));
}

/** The seats the board may still record a manual reset for: their reset group has none yet. */
export function resettableSeats(page: SeatsPage): string[] {
  return page.seats.filter((seat) => !seat.manualResetUsed).map((seat) => seat.seatId);
}

/** How long until `to`, from `at`: "in 2 h 30 min", "in 3 d 4 h", or "now" once it has passed. */
export function untilText(at: string, to: string): string {
  const minutes = Math.round((Date.parse(to) - Date.parse(at)) / minuteMs);
  return minutes <= 0 ? "now" : `in ${durationText(minutes)}`;
}

function readingText(seat: SeatRow, at: string): string {
  const read = ageText(seat.readingAgeMinutes);
  return seat.nextReadAt === undefined ? read : `${read}, next ${untilText(at, seat.nextReadAt)}`;
}

function ageText(minutes: number | undefined): string {
  if (minutes === undefined) {
    return "Not read yet";
  }
  return minutes === 0 ? "Read just now" : `Read ${durationText(minutes)} ago`;
}

function durationText(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  if (minutes < 48 * 60) {
    const rest = minutes % 60;
    return rest === 0
      ? `${Math.floor(minutes / 60)} h`
      : `${Math.floor(minutes / 60)} h ${rest} min`;
  }
  const hours = Math.floor(minutes / 60) % 24;
  return hours === 0
    ? `${Math.floor(minutes / 1440)} d`
    : `${Math.floor(minutes / 1440)} d ${hours} h`;
}

function seatCount(count: number): string {
  return count === 1 ? "1 seat" : `${count} seats`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const readErrorText: Record<ReadError, string> = {
  timeout: "Reading timed out",
  "rate-limited": "Rate-limited",
  "signed-out": "Signed out",
  unreadable: "Reading unreadable",
};

const alertText: Record<SeatAlertKind, string> = {
  "signed-out": "signed out",
  "not-subscription": "not a subscription",
  "other-account": "signed in to another account",
  "sign-in-expired": "sign-in expired",
  "sign-in-expiring": "sign-in expires within a day",
  "readings-stopped": "readings stopped",
};
