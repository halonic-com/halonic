import type { MoveReason, PlacementProposal, SeatNow, WindowNow } from "../placement-rules.ts";
import type { SeatAlertKind } from "../read/seat-watch.ts";
import type { AgentId, ReadError, SeatId, SeatRole } from "../records.ts";
import type { SeatsNow } from "./seats-now.ts";
import type { SeatReadStatus } from "./seats-reader.ts";

/**
 * What the "AI seats" page shows (seat forecast, section 6): the top cards,
 * the seat table, the weekly refills of the next 7 days and the moves
 * `seats.check` would propose now. Never a folder, an account, a connection
 * id or program output. The forecast numbers (run-out time P50–P90, the
 * sustainable rate, forecast at reset) come once the seat forecast is wired
 * (HAL-16026); until then `forecast` is undefined and the page says so.
 */
export interface SeatsPage {
  readonly at: string;
  /** When the worker started; back-off and alerts count from then. */
  readonly readerStartedAt: string;
  readonly movesEnabled: boolean;
  readonly cards: SeatsPageCards;
  readonly seats: readonly SeatRow[];
  /** Pool seats' weekly resets in the next 7 days, soonest first. */
  readonly refills: readonly Refill[];
  readonly proposal: PageProposal;
  /** Filled in by the seat forecast (HAL-16026). */
  readonly forecast: undefined;
}

/** The top cards that need no forecast. */
export interface SeatsPageCards {
  /** Weekly points left over the readable pool seats: 100 minus each one's week %. */
  readonly poolPointsLeft: number;
  /** Pool seats left out of `poolPointsLeft` because they can't be read now. */
  readonly poolSeatsUnreadable: number;
  /** Weekly points per hour the readable pool seats use now; undefined without any rate. */
  readonly poolPointsPerHour: number | undefined;
  /** The soonest refill of a pool seat's week. */
  readonly nextRefill: Refill | undefined;
}

/** One seat's week coming back: at `at`, its `points` used return. */
export interface Refill {
  readonly seatId: SeatId;
  readonly at: string;
  readonly points: number;
}

/** One row of the seat table. */
export interface SeatRow {
  readonly seatId: SeatId;
  readonly role: SeatRole;
  readonly resetGroup: string | undefined;
  readonly manualResetUsed: boolean;
  /** `false` when the newest read failed or is too old; the rules leave the seat alone. */
  readonly readable: boolean;
  readonly lastError: ReadError | undefined;
  readonly readingAgeMinutes: number | undefined;
  readonly nextReadAt: string | undefined;
  readonly signInExpiresAt: string | undefined;
  readonly alerts: readonly SeatAlertKind[];
  readonly session: WindowRow | undefined;
  readonly week: WindowRow | undefined;
  /** The agents on the seat now, by name. */
  readonly agents: readonly AgentLabel[];
}

/** One window in the seat table, with when it reaches 80% and 90% at today's rate. */
export interface WindowRow extends WindowNow {
  /** `at` itself when it is already there; undefined when it won't before its reset. */
  readonly reaches80At: string | undefined;
  readonly reaches90At: string | undefined;
}

/** An agent as the page shows it. */
export interface AgentLabel {
  readonly agentId: AgentId;
  readonly name: string;
}

/** A proposed move, with the agent's name. */
export interface PageMove {
  readonly agent: AgentLabel;
  readonly from: SeatId;
  /** `undefined` when no seat can take the agent. */
  readonly to: SeatId | undefined;
  readonly reason: MoveReason;
}

/** What `seats.check` would propose now. It moves no one. */
export interface PageProposal {
  readonly moves: readonly PageMove[];
  readonly resetAdvice: readonly SeatId[];
}

/** What the page is built from; all of it already read. */
export interface SeatsPageInput {
  readonly now: SeatsNow;
  readonly proposal: PlacementProposal;
  readonly statuses: readonly SeatReadStatus[];
  readonly readerStartedAt: string;
  readonly movesEnabled: boolean;
  readonly at: string;
}

const hourMs = 60 * 60_000;
const refillDays = 7;

/** Builds the page. Pure: it reads nothing. */
export function seatsPage(input: SeatsPageInput): SeatsPage {
  const { now, at } = input;
  const label = (agentId: AgentId): AgentLabel => ({
    agentId,
    name: now.agentNames.get(agentId) ?? agentId,
  });
  const seats = now.seats.map((seat) =>
    seatRow(seat, input.statuses, agentsOn(seat.id, now.placements).map(label), at),
  );
  const refills = weeklyRefills(now.seats, at);
  return {
    at,
    readerStartedAt: input.readerStartedAt,
    movesEnabled: input.movesEnabled,
    cards: cards(now.seats, refills),
    seats,
    refills,
    proposal: {
      moves: input.proposal.moves.map((move) => ({
        agent: label(move.agentId),
        from: move.from,
        to: move.to,
        reason: move.reason,
      })),
      resetAdvice: input.proposal.resetAdvice,
    },
    forecast: undefined,
  };
}

/**
 * When `window` reaches `percent` at its current rate: `at` when it is
 * already there, undefined without a rising rate or when its reset comes first.
 */
export function reachesAt(window: WindowNow, percent: number, at: string): string | undefined {
  if (window.usedPercent >= percent) {
    return at;
  }
  const rate = window.percentPerHour;
  if (rate === undefined || rate <= 0) {
    return undefined;
  }
  const reachedMs = Date.parse(at) + ((percent - window.usedPercent) / rate) * hourMs;
  if (window.resetsAt !== undefined && reachedMs >= Date.parse(window.resetsAt)) {
    return undefined;
  }
  return new Date(reachedMs).toISOString();
}

function seatRow(
  seat: SeatNow,
  statuses: readonly SeatReadStatus[],
  agents: readonly AgentLabel[],
  at: string,
): SeatRow {
  const status = statuses.find((candidate) => candidate.seatId === seat.id);
  const ageMs = status?.readingAgeMs;
  return {
    seatId: seat.id,
    role: seat.role,
    resetGroup: seat.resetGroup,
    manualResetUsed: seat.manualResetUsed,
    readable: seat.readable,
    lastError: status?.lastError,
    readingAgeMinutes: ageMs === undefined ? undefined : Math.floor(ageMs / 60_000),
    nextReadAt: status?.nextReadAt,
    signInExpiresAt: status?.signInExpiresAt,
    alerts: status?.alerts ?? [],
    session: windowRow(seat.session, at),
    week: windowRow(seat.week, at),
    agents,
  };
}

function windowRow(window: WindowNow | undefined, at: string): WindowRow | undefined {
  if (window === undefined) {
    return undefined;
  }
  return {
    ...window,
    reaches80At: reachesAt(window, 80, at),
    reaches90At: reachesAt(window, 90, at),
  };
}

function agentsOn(seatId: SeatId, placements: ReadonlyMap<AgentId, SeatId>): AgentId[] {
  return [...placements.entries()]
    .filter(([, placed]) => placed === seatId)
    .map(([agentId]) => agentId)
    .sort((a, b) => a.localeCompare(b));
}

/** Pool seats whose week resets within 7 days of `at`, soonest first. */
function weeklyRefills(seats: readonly SeatNow[], at: string): Refill[] {
  const from = Date.parse(at);
  const until = from + refillDays * 24 * hourMs;
  const refills: Refill[] = [];
  for (const seat of seats) {
    const week = seat.week;
    if (seat.role !== "pool" || week?.resetsAt === undefined) {
      continue;
    }
    const resetMs = Date.parse(week.resetsAt);
    if (resetMs > from && resetMs <= until) {
      refills.push({ seatId: seat.id, at: week.resetsAt, points: week.usedPercent });
    }
  }
  return refills.sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seatId.localeCompare(b.seatId),
  );
}

function cards(seats: readonly SeatNow[], refills: readonly Refill[]): SeatsPageCards {
  const pool = seats.filter((seat) => seat.role === "pool");
  const readable = pool.filter((seat) => seat.readable && seat.week !== undefined);
  let pointsLeft = 0;
  let pointsPerHour: number | undefined;
  for (const seat of readable) {
    const week = seat.week;
    if (week === undefined) {
      continue;
    }
    pointsLeft += Math.max(0, 100 - week.usedPercent);
    if (week.percentPerHour !== undefined) {
      pointsPerHour = (pointsPerHour ?? 0) + Math.max(0, week.percentPerHour);
    }
  }
  return {
    poolPointsLeft: pointsLeft,
    poolSeatsUnreadable: pool.length - readable.length,
    poolPointsPerHour: pointsPerHour,
    nextRefill: refills[0],
  };
}
