import {
  type AgentPlace,
  type Break,
  breaks,
  breaksQuietSeat,
  isExcluded,
  isHeavy,
  isPaidApi,
  isPinned,
  isReviewer,
  type Placement,
  type Seat,
  seatedOn,
  sessionStopFor,
  targetRefusal,
  weekAllows,
} from "./checklist.ts";
import type { SeatMoverSettings } from "./settings.ts";

/**
 * Which agents leave their seat this pass, and where to (HAL-19354). Every
 * target passes the whole checklist (checklist.ts) against the placement as
 * the batch leaves it, and the finished batch is checked once more: a batch
 * that would leave a break is not sent at all. Agents and seats are taken in
 * a fixed order, so the same state always gives the same plan. No I/O here.
 */

/** Why an agent leaves its seat. */
export type MoveReason =
  | "d-admin"
  | "e-paid-api"
  | "not-connected"
  | "quota-hit"
  | "parked"
  | "session-stop"
  | "week-stop"
  | "b-reviewer-seat"
  | "b-reviewers-share"
  | "b-reviewer-not-alone"
  | "c-heavy-limit"
  | "g-quiet-seat";

export interface Move {
  readonly agent: AgentPlace;
  readonly from: string | undefined;
  readonly to: Seat;
  readonly reason: MoveReason;
}

/** An agent that should move but no seat may take: it stays, and the board hears of it once. */
export interface Stuck {
  readonly agent: AgentPlace;
  readonly from: string | undefined;
  readonly reason: MoveReason;
}

export interface SeatPlan {
  readonly moves: readonly Move[];
  readonly stuck: readonly Stuck[];
  /** Non-empty only if the batch would have left a break; then `moves` is empty. */
  readonly refused: readonly Break[];
}

/** The fixed order: by url key. */
const byKey = (a: AgentPlace, b: AgentPlace) => a.key.localeCompare(b.key);

/** Usage and placement reasons to leave the seat the agent is on in `placement`. */
function moveReason(
  agent: AgentPlace,
  placement: Placement,
  seats: ReadonlyMap<string, Seat>,
  agents: readonly AgentPlace[],
  settings: SeatMoverSettings,
  now: Date,
): MoveReason | undefined {
  const connectionId = placement.get(agent.id);
  const seat = connectionId === undefined ? undefined : seats.get(connectionId);
  if (seat !== undefined && isExcluded(seat, settings)) {
    return "d-admin";
  }
  if (seat !== undefined && isPaidApi(seat)) {
    return "e-paid-api";
  }
  if (seat?.connection === "not-connected") {
    return "not-connected";
  }
  const others = connectionId === undefined ? [] : seatedOn(connectionId, placement, agents);
  if (!isReviewer(agent, settings) && others.some((other) => isReviewer(other, settings))) {
    return "b-reviewer-seat";
  }
  if (agent.paused) {
    // A paused agent uses nothing: only where it sits can be wrong.
    return undefined;
  }
  return (
    usageReason(agent, seat, settings, now) ??
    heavyReason(agent, others, settings) ??
    (breaksQuietSeat(agent, others, settings) ? "g-quiet-seat" : undefined)
  );
}

function usageReason(
  agent: AgentPlace,
  seat: Seat | undefined,
  settings: SeatMoverSettings,
  now: Date,
): MoveReason | undefined {
  if (seat?.quotaHit === true) {
    return "quota-hit";
  }
  if (agent.parked) {
    return "parked";
  }
  if (seat?.reading === undefined) {
    // No reading: unknown is not a reason to move anyone off.
    return undefined;
  }
  if (seat.reading.sessionPercent >= sessionStopFor(agent, settings)) {
    return "session-stop";
  }
  return weekAllows(seat, settings, now) ? undefined : "week-stop";
}

/** The heavy agents past the limit leave, the last by url key first. */
function heavyReason(
  agent: AgentPlace,
  seated: readonly AgentPlace[],
  settings: SeatMoverSettings,
): MoveReason | undefined {
  if (!isHeavy(agent, settings)) {
    return undefined;
  }
  const heavy = seated.filter((other) => isHeavy(other, settings) && !other.paused).sort(byKey);
  return heavy.indexOf(agent) >= settings.maxHeavyPerSeat ? "c-heavy-limit" : undefined;
}

/**
 * The seat with the fewest agents already sent to it this pass first, then the
 * most 5-hour room, the soonest weekly reset, the emptiest, and the name.
 * Readings don't change within a pass, so without the first rule every agent
 * leaving a full seat would pick the same seat (HAL-19394).
 */
function compareTargets(
  a: Seat,
  b: Seat,
  placement: Placement,
  agents: readonly AgentPlace[],
  arrivals: (seat: Seat) => number,
): number {
  const sent = arrivals(a) - arrivals(b);
  if (sent !== 0) {
    return sent;
  }
  const session = (a.reading?.sessionPercent ?? 100) - (b.reading?.sessionPercent ?? 100);
  if (session !== 0) {
    return session;
  }
  const reset = resetMs(a) - resetMs(b);
  if (reset !== 0) {
    return reset;
  }
  const load =
    seatedOn(a.connectionId, placement, agents).length -
    seatedOn(b.connectionId, placement, agents).length;
  return load !== 0 ? load : a.name.localeCompare(b.name);
}

function resetMs(seat: Seat): number {
  const resetsAt = seat.reading?.weekResetsAt;
  return resetsAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(resetsAt);
}

/** Plans one pass's batch from the seats, the agents (with where they sit) and the settings. */
export function planMoves(
  seatList: readonly Seat[],
  agentList: readonly AgentPlace[],
  settings: SeatMoverSettings,
  now: Date,
): SeatPlan {
  const batch = new Batch(seatList, agentList, settings, now);
  const movable = batch.agents.filter((agent) => !isPinned(agent, settings));
  const reviewers = movable.filter((agent) => isReviewer(agent, settings));
  // Reviewers first: they get the seats with the most 5-hour room, alone. One
  // sitting with a pinned agent moves now too, before spreading the others
  // can take the empty seat it needs (HAL-19464).
  for (const reviewer of reviewers) {
    batch.moveIfNeeded(reviewer, batch.reasonFor(reviewer) ?? reviewerSeatReason(reviewer, batch));
  }
  // Then heavy agents, whose limit is the tighter one, then everyone else.
  const rest = movable.filter((agent) => !isReviewer(agent, settings));
  const ordered = [
    ...rest.filter((agent) => isHeavy(agent, settings)),
    ...rest.filter((agent) => !isHeavy(agent, settings)),
  ];
  for (const agent of ordered) {
    batch.moveIfNeeded(agent, batch.reasonFor(agent));
  }
  // A reviewer whose company couldn't move off moves itself, if an empty seat may take it.
  for (const reviewer of reviewers) {
    if (batch.hasCompany(reviewer) && !batch.hasMoved(reviewer)) {
      batch.moveIfNeeded(reviewer, "b-reviewer-not-alone");
    }
  }
  return finish(batch);
}

/** The batch while it is planned: where agents sit so far, the moves and who is stuck. */
class Batch {
  readonly seats: ReadonlyMap<string, Seat>;
  readonly agents: readonly AgentPlace[];
  /** Where agents sat before the batch. */
  readonly start: Placement;
  readonly placement = new Map<string, string>();
  readonly moves: Move[] = [];
  readonly stuck: Stuck[] = [];
  readonly settings: SeatMoverSettings;
  readonly now: Date;

  constructor(
    seatList: readonly Seat[],
    agentList: readonly AgentPlace[],
    settings: SeatMoverSettings,
    now: Date,
  ) {
    this.settings = settings;
    this.now = now;
    this.seats = new Map(seatList.map((seat) => [seat.connectionId, seat]));
    this.agents = [...agentList].sort(byKey);
    for (const agent of this.agents) {
      if (agent.connectionId !== undefined) {
        this.placement.set(agent.id, agent.connectionId);
      }
    }
    this.start = new Map(this.placement);
  }

  reasonFor(agent: AgentPlace): MoveReason | undefined {
    return moveReason(agent, this.placement, this.seats, this.agents, this.settings, this.now);
  }

  /** Moves the agent to the best seat the checklist allows, or lists it as stuck. */
  moveIfNeeded(agent: AgentPlace, reason: MoveReason | undefined): void {
    if (reason === undefined) {
      return;
    }
    const from = this.placement.get(agent.id);
    const to = [...this.seats.values()]
      .filter(
        (seat) =>
          targetRefusal(seat, agent, this.placement, this.agents, this.settings, this.now) ===
          undefined,
      )
      .sort((a, b) =>
        compareTargets(a, b, this.placement, this.agents, (seat) => this.arrivals(seat)),
      )[0];
    if (to === undefined) {
      this.stuck.push({ agent, from, reason });
      return;
    }
    this.placement.set(agent.id, to.connectionId);
    this.moves.push({ agent, from, to, reason });
  }

  /** How many agents this batch has sent to the seat so far. */
  arrivals(seat: Seat): number {
    return seatedOn(seat.connectionId, this.placement, this.agents).filter(
      (agent) => this.start.get(agent.id) !== seat.connectionId,
    ).length;
  }

  hasCompany(agent: AgentPlace): boolean {
    const connectionId = this.placement.get(agent.id);
    return (
      connectionId !== undefined && seatedOn(connectionId, this.placement, this.agents).length > 1
    );
  }

  hasMoved(agent: AgentPlace): boolean {
    return this.moves.some((move) => move.agent.id === agent.id);
  }
}

/** Why a reviewer with no reason of its own still leaves: it shares its seat with one that stays. */
function reviewerSeatReason(reviewer: AgentPlace, batch: Batch): MoveReason | undefined {
  const { placement, agents, settings } = batch;
  if (sharesWithReviewer(reviewer, placement, agents, settings)) {
    return "b-reviewers-share";
  }
  const connectionId = placement.get(reviewer.id);
  const pinnedMate =
    connectionId !== undefined &&
    seatedOn(connectionId, placement, agents).some(
      (other) => other.id !== reviewer.id && isPinned(other, settings),
    );
  return pinnedMate ? "b-reviewer-not-alone" : undefined;
}

function sharesWithReviewer(
  reviewer: AgentPlace,
  placement: Placement,
  agents: readonly AgentPlace[],
  settings: SeatMoverSettings,
): boolean {
  const connectionId = placement.get(reviewer.id);
  if (connectionId === undefined) {
    return false;
  }
  const otherReviewers = seatedOn(connectionId, placement, agents)
    .filter((other) => other.id !== reviewer.id && isReviewer(other, settings))
    .sort(byKey);
  // The first reviewer by url key stays; the others leave.
  return otherReviewers.some((other) => byKey(other, reviewer) < 0);
}

/**
 * The last check: the batch must add no break on the seats it sends agents
 * to. If it would, nobody moves this pass. A break those seats already had
 * (say a third heavy agent that is stuck) doesn't stop the batch, or one
 * stuck agent would stop every move, every pass.
 */
function finish(batch: Batch): SeatPlan {
  const { moves, stuck } = batch;
  const targets = moves.map((move) => move.to.connectionId);
  const breaksIn = (placement: Placement) =>
    breaks(targets, batch.seats, placement, batch.agents, batch.settings);
  const before = breaksIn(batch.start);
  const refused = breaksIn(batch.placement).filter(
    (found) =>
      !before.some((had) => had.connectionId === found.connectionId && had.rule === found.rule),
  );
  return { moves: refused.length > 0 ? [] : moves, stuck, refused };
}
