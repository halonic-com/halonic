/**
 * The placement rules of `seats.check`: which agents should move off which
 * seat, where to, and which full seat is worth its one manual reset. From the
 * seat forecast's plan (HAL-15997, section 4.4): move at 80% of the 5-hour
 * window or when it is projected above 90%, move off at 88% of the week,
 * reserves only when no pool seat fits, and never the paid API.
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
  /** … within this many minutes. */
  readonly projectionMinutes: number;
  /** Move off at this much of the week. */
  readonly weekMovePercent: number;
  /** How many agents a seat may take; `undefined` for no limit. */
  readonly agentsPerSeat: number | undefined;
  /** A full seat is worth a manual reset only when its weekly reset is at least this far off. */
  readonly resetAdviceDays: number;
}

export const defaultPlacementRules: PlacementRules = {
  sessionMovePercent: 80,
  sessionProjectedPercent: 90,
  projectionMinutes: 60,
  weekMovePercent: 88,
  agentsPerSeat: undefined,
  resetAdviceDays: 3,
};

/** Why an agent should leave its seat. */
export type MoveReason = "session-full" | "session-projected" | "week-full" | "paid-api";

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
const dayMs = 24 * 60 * minuteMs;

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
  const targets = seats
    .filter((seat) => canTake(seat, now, rules))
    .sort((a, b) => compareTargets(a, b));

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
  if (seat.session !== undefined && seat.session.usedPercent >= rules.sessionMovePercent) {
    return "session-full";
  }
  if (
    seat.session !== undefined &&
    projectedPercent(seat.session, now, rules) > rules.sessionProjectedPercent
  ) {
    return "session-projected";
  }
  if (seat.week !== undefined && seat.week.usedPercent >= rules.weekMovePercent) {
    return "week-full";
  }
  return undefined;
}

/**
 * The 5-hour window's percent `projectionMinutes` from now at its current
 * rate, or at its reset if that comes first (after it, the window is empty).
 */
export function projectedPercent(window: WindowNow, now: string, rules: PlacementRules): number {
  if (window.percentPerHour === undefined || window.percentPerHour <= 0) {
    return window.usedPercent;
  }
  const nowMs = Date.parse(now);
  const horizonMs = nowMs + rules.projectionMinutes * minuteMs;
  const untilMs =
    window.resetsAt === undefined ? horizonMs : Math.min(horizonMs, Date.parse(window.resetsAt));
  const hours = Math.max(0, untilMs - nowMs) / (60 * minuteMs);
  return window.usedPercent + window.percentPerHour * hours;
}

/** A seat takes agents when it is a pool or reserve seat, readable, active and not near a limit. */
function canTake(seat: SeatNow, now: string, rules: PlacementRules): boolean {
  if (seat.role === "paid-api" || seat.status !== "active" || !seat.readable) {
    return false;
  }
  if (seat.session === undefined || seat.week === undefined) {
    return false;
  }
  return moveReason(seat, now, rules) === undefined;
}

/** Pool seats before reserves; then the weekly reset that comes soonest; then the less used week. */
function compareTargets(a: SeatNow, b: SeatNow): number {
  const byRole = rolePlace(a.role) - rolePlace(b.role);
  if (byRole !== 0) {
    return byRole;
  }
  const byReset = resetMs(a) - resetMs(b);
  if (byReset !== 0) {
    return byReset;
  }
  const byUse = (a.week?.usedPercent ?? 0) - (b.week?.usedPercent ?? 0);
  return byUse !== 0 ? byUse : a.id.localeCompare(b.id);
}

function rolePlace(role: SeatRole): number {
  return role === "pool" ? 0 : 1;
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
