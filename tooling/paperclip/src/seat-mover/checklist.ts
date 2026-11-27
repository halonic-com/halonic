import type { SeatMoverSettings } from "./settings.ts";

/**
 * The board's pre-move checklist (HAL-19354, a–g, with the board's audit
 * rules of 26 Nov), as code. A seat is a legal
 * target for an agent only when every item holds; `breaks` checks a whole
 * placement against the items that are about who sits together, so a batch is
 * never sent that leaves one of them broken. No I/O here.
 */

/** One seat's newest usage reading. */
export interface SeatReading {
  readonly sessionPercent: number;
  /** When the 5-hour window resets, as the reading reports it. */
  readonly sessionResetsAt: string | undefined;
  readonly weekPercent: number;
  readonly weekResetsAt: string | undefined;
  /** When the reading was taken. */
  readonly at: string;
}

/**
 * A connection's status: `connected`, an explicit other status such as
 * expired or revoked (`not-connected`), or none given (`unknown`).
 */
export type ConnectionState = "connected" | "not-connected" | "unknown";

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
  /** Runs are parked waiting for this seat: it is full now, whatever its reading says. */
  readonly waiting: boolean;
  /**
   * Nobody may sit on a `not-connected` seat. An `unknown` one takes nobody
   * new but moves nobody off, like a seat without a reading.
   */
  readonly connection: ConnectionState;
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
  /** The mover moved it less than `moveCooldownMinutes` ago. */
  readonly recentlyMoved: boolean;
  /** When the mover moved it onto the seat it sits on now, if that was less than the cooldown ago. */
  readonly arrivedAt?: string | undefined;
}

/** Agent id → connection id. */
export type Placement = ReadonlyMap<string, string>;

/** Why a seat is not a legal target; the checklist item's letter comes first. */
export type TargetRefusal =
  | "a-week-stop"
  | "b-reviewer-seat"
  | "b-reviewer-company"
  | "c-heavy-limit"
  | "g-quiet-seat"
  | "d-admin"
  | "e-paid-api"
  | "f-session-stop"
  | "not-connected"
  | "connection-unknown"
  | "unread"
  | "same-seat";

const hourMs = 3_600_000;

export const isReviewer = (agent: AgentPlace, settings: SeatMoverSettings) =>
  settings.reviewers.includes(agent.key);

export const isHeavy = (agent: AgentPlace, settings: SeatMoverSettings) =>
  settings.heavy.includes(agent.key);

export const isFastBurner = (agent: AgentPlace, settings: SeatMoverSettings) =>
  settings.fastBurners.includes(agent.key);

/** Pinned agents (the seat starter and the timer agents) are never moved. */
export const isPinned = (agent: AgentPlace, settings: SeatMoverSettings) =>
  settings.pinned.includes(agent.key);

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
 * Item a: whether `agent` may sit on the seat for its week. A reset-fill seat
 * takes anyone. Otherwise nobody sits at the hard stop (95%), and a reserve
 * seat (past the weekly stop, 88%) takes no fast burner unless its weekly
 * reset is less than a day away.
 */
export function weekAllows(
  seat: Seat,
  agent: AgentPlace,
  settings: SeatMoverSettings,
  now: Date,
): boolean {
  const week = seat.reading?.weekPercent;
  if (week === undefined) {
    return false;
  }
  if (isResetFill(seat, settings)) {
    return true;
  }
  if (week >= settings.weekHardStopPercent) {
    return false;
  }
  if (week < settings.weekMovePercent) {
    return true;
  }
  return !isFastBurner(agent, settings) || weekResetsSoon(seat, settings, now);
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

/**
 * Item g: a seat a pinned agent sits on is the quiet seat. No heavy agent that
 * runs may sit there; reviewers already can't, because they sit alone.
 */
const isQuietSeat = (seated: readonly AgentPlace[], settings: SeatMoverSettings) =>
  seated.some((agent) => isPinned(agent, settings));

export const breaksQuietSeat = (
  agent: AgentPlace,
  seated: readonly AgentPlace[],
  settings: SeatMoverSettings,
) => countsAsHeavy(agent, settings) && isQuietSeat(seated, settings);

/**
 * Item b as the board defined "alone" (26 Nov): a reviewer may share its seat
 * with light agents, but not with another reviewer, a heavy agent that runs,
 * or a pinned agent (whose seat is the quiet seat).
 */
export const crowdsReviewer = (agent: AgentPlace, settings: SeatMoverSettings) =>
  isReviewer(agent, settings) || countsAsHeavy(agent, settings) || isPinned(agent, settings);

/** The 5-hour stop that applies to an agent: a reviewer's is lower (HAL-19202). */
export const sessionStopFor = (agent: AgentPlace, settings: SeatMoverSettings) =>
  isReviewer(agent, settings) ? settings.reviewerSessionMovePercent : settings.sessionMovePercent;

/**
 * Whether the mover moved the agent onto `seat` after the seat's reading was
 * taken (HAL-19695): the reading doesn't show its use yet, so it counts as an
 * arrival. Readings come only at :17 and :47, so the next pass, a minute
 * later, would otherwise fill the same seat again.
 */
export function arrivedSinceReading(agent: AgentPlace, seat: Seat): boolean {
  return (
    agent.arrivedAt !== undefined &&
    seat.reading !== undefined &&
    agent.connectionId === seat.connectionId &&
    Date.parse(agent.arrivedAt) > Date.parse(seat.reading.at)
  );
}

/**
 * Whether the seat stays below the agent's 5-hour stop with `arriving` agents
 * its reading doesn't show yet (sent to it this pass, or by the mover since
 * the reading) and this one: each arrival is counted at
 * `targetHeadroomPercent` of the window. Readings don't change within a pass,
 * so without this headroom a seat just under the stop takes agents and the
 * next reading moves them off again.
 */
export function sessionHasRoom(
  reading: SeatReading,
  agent: AgentPlace,
  settings: SeatMoverSettings,
  arriving: number,
): boolean {
  const projected = reading.sessionPercent + settings.targetHeadroomPercent * (arriving + 1);
  return projected < sessionStopFor(agent, settings);
}

/**
 * Why `seat` may not take `agent` in `placement`, or `undefined` when every
 * checklist item holds. The 5-hour stop is the agent's own, so a reviewer is
 * never placed where it would have to move again at once. `arriving` is how
 * many agents the seat's reading doesn't show yet (see `sessionHasRoom`).
 */
export function targetRefusal(
  seat: Seat,
  agent: AgentPlace,
  placement: Placement,
  agents: readonly AgentPlace[],
  settings: SeatMoverSettings,
  now: Date,
  arriving = 0,
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
  if (seat.connection === "not-connected") {
    return "not-connected";
  }
  if (seat.connection === "unknown") {
    return "connection-unknown";
  }
  if (seat.reading === undefined || seat.grantId === undefined) {
    return "unread";
  }
  if (seat.quotaHit || seat.waiting || !sessionHasRoom(seat.reading, agent, settings, arriving)) {
    return "f-session-stop";
  }
  if (!weekAllows(seat, agent, settings, now)) {
    return "a-week-stop";
  }
  const others = seatedOn(seat.connectionId, placement, agents).filter(
    (other) => other.id !== agent.id,
  );
  return companyRefusal(agent, others, settings);
}

/**
 * Items b, c and g: whether `agent` may join the agents already on a seat.
 * Nobody joins a reviewer's seat; a reviewer joins only light agents.
 */
function companyRefusal(
  agent: AgentPlace,
  others: readonly AgentPlace[],
  settings: SeatMoverSettings,
): TargetRefusal | undefined {
  if (others.some((other) => isReviewer(other, settings))) {
    return "b-reviewer-seat";
  }
  if (isReviewer(agent, settings) && others.some((other) => crowdsReviewer(other, settings))) {
    return "b-reviewer-company";
  }
  const heavy = others.filter((other) => countsAsHeavy(other, settings)).length;
  if (countsAsHeavy(agent, settings) && heavy >= settings.maxHeavyPerSeat) {
    return "c-heavy-limit";
  }
  if (breaksQuietSeat(agent, others, settings)) {
    return "g-quiet-seat";
  }
  return undefined;
}

/** A rule a placement breaks on one seat. */
export interface Break {
  readonly connectionId: string;
  readonly rule:
    | "b-reviewer-not-alone"
    | "c-heavy-limit"
    | "d-admin"
    | "e-paid-api"
    | "g-quiet-seat";
}

/**
 * The checklist items a placement breaks on the given seats: a reviewer with
 * another reviewer, a heavy or a pinned agent, more heavy agents than allowed, anyone on an excluded seat or
 * on the paid API, a heavy agent on the quiet seat. (Items a and f are about
 * the seat's use, which a move doesn't change before the next reading;
 * `targetRefusal` covers them.)
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
    found.push(...companyBreaks(seated, settings).map((rule) => ({ connectionId, rule })));
  }
  return found;
}

/** Items b, c and g: what the agents on one seat break by sitting together. */
function companyBreaks(
  seated: readonly AgentPlace[],
  settings: SeatMoverSettings,
): Break["rule"][] {
  const found: Break["rule"][] = [];
  const crowd = seated.filter((agent) => crowdsReviewer(agent, settings));
  if (crowd.length > 1 && crowd.some((agent) => isReviewer(agent, settings))) {
    found.push("b-reviewer-not-alone");
  }
  const heavy = seated.filter((agent) => countsAsHeavy(agent, settings)).length;
  if (heavy > settings.maxHeavyPerSeat) {
    found.push("c-heavy-limit");
  }
  if (seated.some((agent) => breaksQuietSeat(agent, seated, settings))) {
    found.push("g-quiet-seat");
  }
  return found;
}
