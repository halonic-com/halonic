/**
 * The placement rules of `seats.check`: which agents should move off which
 * seat, where to, and which full seat is worth its one manual reset. They are
 * the Seat Supervisor's rules as it runs them (HAL-16021): move at 80% of the
 * 5-hour window or when it is projected above 90% before its reset, move
 * everyone at 95%, move off at 88% of the week or at 75% with the weekly reset
 * more than a day away; send agents to the seat with the emptiest 5-hour
 * window, reserves only when no other seat fits, and never the paid API.
 *
 * These are proposals only: the board applies them (or, behind its
 * **Move agents** switch, phase 4 does). No I/O here: the job hands in each
 * seat's state and the open placements, and posts what this returns.
 */

import type { AgentId, SeatId, SeatRole } from "./records.ts";

/** One window of a seat now, from its newest good reading and `project()`. */
export interface WindowNow {
  readonly usedPercent: number;
  /** `undefined` without enough readings for a rate. */
  readonly percentPerHour: number | undefined;
  readonly resetsAt: string | undefined;
}

/** What the rules know about one seat. */
export interface SeatNow {
  readonly id: SeatId;
  readonly role: SeatRole;
  readonly status: "active" | "paused";
  readonly resetGroup: string | undefined;
  /** Whether the seat's reset group has used its one manual reset. */
  readonly manualResetUsed: boolean;
  /**
   * `false` when the newest read failed or is too old to act on. The rules
   * move no one off such a seat and no one onto it.
   */
  readonly readable: boolean;
  readonly session: WindowNow | undefined;
  readonly week: WindowNow | undefined;
}

/** The thresholds; the board can change them in the plugin's settings. */
export interface PlacementRules {
  /** Move off at this much of the 5-hour window. */
  readonly sessionMovePercent: number;
  /** Move off when the 5-hour window is projected to pass this … */
  readonly sessionProjectedPercent: number;
  /** … within this many minutes; `undefined` for "before its reset". */
  readonly projectionMinutes: number | undefined;
  /** Move everyone off at this much of the 5-hour window, or when it would get there before the next check. */
  readonly sessionHardStopPercent: number;
  /** Minutes until the next check, for the hard stop's projection. */
  readonly checkMinutes: number;
  /** Move off at this much of the week. */
  readonly weekMovePercent: number;
  /** A seat with this much of its week used … */
  readonly reservePercent: number;
  /** … and its weekly reset more than this many hours away is kept as a reserve. */
  readonly reserveResetHours: number;
  /** A target's 5-hour window must be below this. */
  readonly targetSessionBelow: number;
  /** A target's week must be below this … */
  readonly targetWeekBelow: number;
  /** … or below this when its weekly reset is within `reserveResetHours`. */
  readonly targetWeekNearResetBelow: number;
  /** How many agents a seat may take; `undefined` for no limit. */
  readonly agentsPerSeat: number | undefined;
  /** A full seat is worth a manual reset only when its weekly reset is at least this far off. */
  readonly resetAdviceDays: number;
}

export const defaultPlacementRules: PlacementRules = {
  sessionMovePercent: 80,
  sessionProjectedPercent: 90,
  projectionMinutes: undefined,
  sessionHardStopPercent: 95,
  checkMinutes: 10,
  weekMovePercent: 88,
  reservePercent: 75,
  reserveResetHours: 24,
  targetSessionBelow: 50,
  targetWeekBelow: 75,
  targetWeekNearResetBelow: 85,
  agentsPerSeat: 3,
  resetAdviceDays: 3,
};

/** Why an agent should leave its seat. */
export type MoveReason =
  | "session-hard-stop"
  | "session-full"
  | "session-projected"
  | "week-full"
  | "week-reserve"
  | "paid-api";

export interface ProposedMove {
  readonly agentId: AgentId;
  readonly from: SeatId;
  /** `undefined` when no seat can take the agent: the proposal says so instead of guessing. */
  readonly to: SeatId | undefined;
  readonly reason: MoveReason;
}

export interface PlacementProposal {
  readonly moves: readonly ProposedMove[];
  /** Full seats whose reset group still has its manual reset and whose weekly reset is far off. */
  readonly resetAdvice: readonly SeatId[];
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

/**
 * The moves and the reset advice at `now` (ISO), for the agents on the seats
 * in `placements` (agent → seat, from the open placements). Agents and seats
 * are taken in a fixed order, so the same state always gives the same proposal.
 */
export function proposePlacements(
  seats: readonly SeatNow[],
  placements: ReadonlyMap<AgentId, SeatId>,
  now: string,
  rules: PlacementRules = defaultPlacementRules,
): PlacementProposal {
  const seatsById = new Map(seats.map((seat) => [seat.id, seat]));
  const load = new Map<SeatId, number>();
  for (const seatId of placements.values()) {
    load.set(seatId, (load.get(seatId) ?? 0) + 1);
  }
  // Seats with room first, then reserves as a last resort; never the paid API.
  const targets = [
    ...seats.filter((seat) => isTarget(seat, now, rules)).sort(compareTargets),
    ...seats.filter((seat) => isLastResort(seat, now, rules)).sort(compareTargets),
  ];

  const moves: ProposedMove[] = [];
  const agents = [...placements.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [agentId, from] of agents) {
    const seat = seatsById.get(from);
    const reason = seat === undefined ? undefined : moveReason(seat, now, rules);
    if (seat === undefined || reason === undefined) {
      continue;
    }
    const to = targets.find((target) => hasRoom(target.id, load, rules))?.id;
    if (to !== undefined) {
      load.set(to, (load.get(to) ?? 0) + 1);
      load.set(from, (load.get(from) ?? 1) - 1);
    }
    moves.push({ agentId, from, to, reason });
  }
  return { moves, resetAdvice: resetAdvice(seats, now, rules) };
}

/** Why agents should leave this seat now, if they should. */
export function moveReason(
  seat: SeatNow,
  now: string,
  rules: PlacementRules,
): MoveReason | undefined {
  if (seat.role === "paid-api") {
    return "paid-api";
  }
  if (!seat.readable) {
    return undefined;
  }
  const session = seat.session;
  if (session !== undefined) {
    if (projectedPercent(session, now, rules.checkMinutes) >= rules.sessionHardStopPercent) {
      return "session-hard-stop";
    }
    if (session.usedPercent >= rules.sessionMovePercent) {
      return "session-full";
    }
    if (projectedPercent(session, now, rules.projectionMinutes) > rules.sessionProjectedPercent) {
      return "session-projected";
    }
  }
  // The 88% rule is checked before the reserve rule, so it always fires
  // first; the Supervisor's old "move off at 90%" is covered by it.
  if (seat.week !== undefined && seat.week.usedPercent >= rules.weekMovePercent) {
    return "week-full";
  }
  if (isReserve(seat, now, rules)) {
    return "week-reserve";
  }
  return undefined;
}

/**
 * The window's percent `minutes` from now at its current rate, or at its
 * reset if that comes first (after it, the window is empty). With `minutes`
 * `undefined`, the percent just before the reset.
 */
export function projectedPercent(
  window: WindowNow,
  now: string,
  minutes: number | undefined,
): number {
  if (window.percentPerHour === undefined || window.percentPerHour <= 0) {
    return window.usedPercent;
  }
  const nowMs = Date.parse(now);
  const horizonMs = minutes === undefined ? Number.POSITIVE_INFINITY : nowMs + minutes * minuteMs;
  const untilMs =
    window.resetsAt === undefined ? horizonMs : Math.min(horizonMs, Date.parse(window.resetsAt));
  if (!Number.isFinite(untilMs)) {
    return window.usedPercent;
  }
  const hours = Math.max(0, untilMs - nowMs) / (60 * minuteMs);
  return window.usedPercent + window.percentPerHour * hours;
}

/** A seat with much of its week used and its weekly reset far off: kept for last. */
function isReserve(seat: SeatNow, now: string, rules: PlacementRules): boolean {
  const week = seat.week;
  if (week === undefined || week.usedPercent < rules.reservePercent) {
    return false;
  }
  return resetMs(seat) - Date.parse(now) > rules.reserveResetHours * hourMs;
}

/** Readable, active, with both windows known, and not the paid API. */
function isOpen(seat: SeatNow): seat is SeatNow & { session: WindowNow; week: WindowNow } {
  return (
    seat.role !== "paid-api" &&
    seat.status === "active" &&
    seat.readable &&
    seat.session !== undefined &&
    seat.week !== undefined
  );
}

/**
 * A first-choice target: a pool seat that isn't a reserve, with its 5-hour
 * window below 50% and its week below 75% (or below 85% when its weekly reset
 * is within a day).
 */
function isTarget(seat: SeatNow, now: string, rules: PlacementRules): boolean {
  if (!isOpen(seat) || seat.role !== "pool" || isReserve(seat, now, rules)) {
    return false;
  }
  const resetSoon = resetMs(seat) - Date.parse(now) <= rules.reserveResetHours * hourMs;
  const weekLimit = resetSoon ? rules.targetWeekNearResetBelow : rules.targetWeekBelow;
  return (
    seat.session.usedPercent < rules.targetSessionBelow &&
    seat.week.usedPercent < weekLimit &&
    moveReason(seat, now, rules) === undefined
  );
}

/** A last-resort target: a reserve seat, or a seat kept as a reserve, below every move limit. */
function isLastResort(seat: SeatNow, now: string, rules: PlacementRules): boolean {
  if (!isOpen(seat) || isTarget(seat, now, rules)) {
    return false;
  }
  const reason = moveReason(seat, now, rules);
  const reserve = seat.role === "reserve" || isReserve(seat, now, rules);
  return (
    reserve &&
    seat.session.usedPercent < rules.targetSessionBelow &&
    (reason === undefined || reason === "week-reserve")
  );
}

/** The emptiest 5-hour window first; then the weekly reset that comes soonest; then the id. */
function compareTargets(a: SeatNow, b: SeatNow): number {
  const bySession = (a.session?.usedPercent ?? 0) - (b.session?.usedPercent ?? 0);
  if (bySession !== 0) {
    return bySession;
  }
  const byReset = resetMs(a) - resetMs(b);
  return byReset !== 0 ? byReset : a.id.localeCompare(b.id);
}

function resetMs(seat: SeatNow): number {
  const resetsAt = seat.week?.resetsAt;
  return resetsAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(resetsAt);
}

function hasRoom(
  seatId: SeatId,
  load: ReadonlyMap<SeatId, number>,
  rules: PlacementRules,
): boolean {
  return rules.agentsPerSeat === undefined || (load.get(seatId) ?? 0) < rules.agentsPerSeat;
}

/**
 * Seats at the weekly limit whose reset group still has its manual reset and
 * whose weekly reset is `resetAdviceDays` or more away; one seat per group,
 * since a group has one reset to spend.
 */
function resetAdvice(seats: readonly SeatNow[], now: string, rules: PlacementRules): SeatId[] {
  const advised = new Map<string, SeatId>();
  const nowMs = Date.parse(now);
  for (const seat of [...seats].sort((a, b) => a.id.localeCompare(b.id))) {
    const group = seat.resetGroup;
    const week = seat.week;
    if (group === undefined || seat.manualResetUsed || !seat.readable || week === undefined) {
      continue;
    }
    if (week.usedPercent < rules.weekMovePercent || week.resetsAt === undefined) {
      continue;
    }
    const farOff = Date.parse(week.resetsAt) - nowMs >= rules.resetAdviceDays * dayMs;
    if (farOff && !advised.has(group)) {
      advised.set(group, seat.id);
    }
  }
  return [...advised.values()];
}
