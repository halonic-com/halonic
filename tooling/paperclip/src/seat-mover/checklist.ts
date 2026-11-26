import type { SeatMoverSettings } from "./settings.ts";

/**
 * The board's pre-move checklist (HAL-19354, a–f), as code. A seat is a legal
 * target for an agent only when every item holds; `breaks` checks a whole
 * placement against the items that are about who sits together, so a batch is
 * never sent that leaves one of them broken. No I/O here.
 */

/** One seat's newest usage reading. */
export interface SeatReading {
  readonly sessionPercent: number;
  readonly weekPercent: number;
  readonly weekResetsAt: string | undefined;
  /** When the reading was taken. */
  readonly at: string;
}

/** One AI connection agents can sit on. */
export interface Seat {
  readonly connectionId: string;
  readonly grantId: string | undefined;
  /** The seat's name in the readings, such as `Noah`. */
  readonly name: string;
  /** `subscription` for a seat; `api_key` is the paid API. */
  readonly method: string;
  /** `undefined` when no usable reading exists: then the seat counts as full. */
  readonly reading: SeatReading | undefined;
  /** A run on this seat failed with `provider_quota` since its reading: it is full now. */
  readonly quotaHit: boolean;
}

/** One agent and where it sits. */
export interface AgentPlace {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly paused: boolean;
  /** The connection in `runtimeConfig.aiConnection`, or `undefined` for none. */
  readonly connectionId: string | undefined;
  /** It has never-started runs parked on its seat (pool wait or a `provider_quota` retry). */
  readonly parked: boolean;
}

/** Agent id → connection id. */
export type Placement = ReadonlyMap<string, string>;

/** Why a seat is not a legal target; the checklist item's letter comes first. */
export type TargetRefusal =
  | "a-week-stop"
  | "b-reviewer-seat"
  | "b-reviewer-needs-empty-seat"
  | "c-heavy-limit"
  | "d-admin"
  | "e-paid-api"
  | "f-session-stop"
  | "unread"
  | "same-seat";

const hourMs = 3_600_000;

export const isReviewer = (agent: AgentPlace, settings: SeatMoverSettings) =>
  settings.reviewers.includes(agent.key);

export const isHeavy = (agent: AgentPlace, settings: SeatMoverSettings) =>
  settings.heavy.includes(agent.key);

export const isExcluded = (seat: Seat, settings: SeatMoverSettings) =>
  settings.excludedSeats.includes(seat.name) || settings.excludedSeats.includes(seat.connectionId);

export const isPaidApi = (seat: Seat) => seat.method !== "subscription";

export const isResetFill = (seat: Seat, settings: SeatMoverSettings) =>
  settings.resetFill.includes(seat.name);

/** The seat's weekly reset is less than `resetSoonHours` away. */
export function weekResetsSoon(seat: Seat, settings: SeatMoverSettings, now: Date): boolean {
  const resetsAt = seat.reading?.weekResetsAt;
  if (resetsAt === undefined) {
    return false;
  }
  return Date.parse(resetsAt) - now.getTime() < settings.resetSoonHours * hourMs;
}

/**
 * Item a: the week is below the weekly stop, or the seat is on the reset-fill
 * list, or its weekly reset is less than a day away (and it is below the hard stop).
 */
export function weekAllows(seat: Seat, settings: SeatMoverSettings, now: Date): boolean {
  const week = seat.reading?.weekPercent;
  if (week === undefined) {
    return false;
  }
  if (isResetFill(seat, settings) || week < settings.weekMovePercent) {
    return true;
  }
  return weekResetsSoon(seat, settings, now) && week < settings.weekHardStopPercent;
}

/** The agents on a seat in a placement, from the full list of agents. */
export function seatedOn(
  connectionId: string,
  placement: Placement,
  agents: readonly AgentPlace[],
): AgentPlace[] {
  return agents.filter((agent) => placement.get(agent.id) === connectionId);
}

/** Heavy agents that run (not paused) count against item c. */
const countsAsHeavy = (agent: AgentPlace, settings: SeatMoverSettings) =>
  isHeavy(agent, settings) && !agent.paused;

/** The 5-hour stop that applies to an agent: a reviewer's is lower (HAL-19202). */
export const sessionStopFor = (agent: AgentPlace, settings: SeatMoverSettings) =>
  isReviewer(agent, settings) ? settings.reviewerSessionMovePercent : settings.sessionMovePercent;

/**
 * Why `seat` may not take `agent` in `placement`, or `undefined` when every
 * checklist item holds. The 5-hour stop is the agent's own, so a reviewer is
 * never placed where it would have to move again at once.
 */
export function targetRefusal(
  seat: Seat,
  agent: AgentPlace,
  placement: Placement,
  agents: readonly AgentPlace[],
  settings: SeatMoverSettings,
  now: Date,
): TargetRefusal | undefined {
  if (placement.get(agent.id) === seat.connectionId) {
    return "same-seat";
  }
  if (isExcluded(seat, settings)) {
    return "d-admin";
  }
  if (isPaidApi(seat)) {
    return "e-paid-api";
  }
  if (seat.reading === undefined || seat.grantId === undefined) {
    return "unread";
  }
  if (seat.quotaHit || seat.reading.sessionPercent >= sessionStopFor(agent, settings)) {
    return "f-session-stop";
  }
  if (!weekAllows(seat, settings, now)) {
    return "a-week-stop";
  }
  const others = seatedOn(seat.connectionId, placement, agents).filter(
    (other) => other.id !== agent.id,
  );
  if (others.some((other) => isReviewer(other, settings))) {
    return "b-reviewer-seat";
  }
  if (isReviewer(agent, settings) && others.length > 0) {
    return "b-reviewer-needs-empty-seat";
  }
  const heavy = others.filter((other) => countsAsHeavy(other, settings)).length;
  if (countsAsHeavy(agent, settings) && heavy >= settings.maxHeavyPerSeat) {
    return "c-heavy-limit";
  }
  return undefined;
}

/** A rule a placement breaks on one seat. */
export interface Break {
  readonly connectionId: string;
  readonly rule: "b-reviewer-not-alone" | "c-heavy-limit" | "d-admin" | "e-paid-api";
}

/**
 * The checklist items a placement breaks on the given seats: a reviewer with
 * anyone else, more heavy agents than allowed, anyone on an excluded seat or
 * on the paid API. (Items a and f are about the seat's use, which a move
 * doesn't change before the next reading; `targetRefusal` covers them.)
 */
export function breaks(
  connectionIds: Iterable<string>,
  seats: ReadonlyMap<string, Seat>,
  placement: Placement,
  agents: readonly AgentPlace[],
  settings: SeatMoverSettings,
): Break[] {
  const found: Break[] = [];
  for (const connectionId of new Set(connectionIds)) {
    const seated = seatedOn(connectionId, placement, agents);
    if (seated.length === 0) {
      continue;
    }
    const seat = seats.get(connectionId);
    if (seat !== undefined && isExcluded(seat, settings)) {
      found.push({ connectionId, rule: "d-admin" });
    }
    if (seat !== undefined && isPaidApi(seat)) {
      found.push({ connectionId, rule: "e-paid-api" });
    }
    if (seated.length > 1 && seated.some((agent) => isReviewer(agent, settings))) {
      found.push({ connectionId, rule: "b-reviewer-not-alone" });
    }
    const heavy = seated.filter((agent) => countsAsHeavy(agent, settings)).length;
    if (heavy > settings.maxHeavyPerSeat) {
      found.push({ connectionId, rule: "c-heavy-limit" });
    }
  }
  return found;
}
