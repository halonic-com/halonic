/**
 * The seat forecast (`seats.forecast`): where each window of each seat will
 * be at its reset, when it reaches 80, 90 and 100%, and the capacity that
 * comes free at each reset over the next 7 days.
 *
 * A seat uses no tokens itself. Each hour, it gains the points of the agents
 * placed on it then: each agent's demand (`demand.ts`) priced at the seat's
 * plan, the agent's model and the window (`calibrate.ts`). Because placements
 * carry times, a planned move is just a placement that starts later, and the
 * seat's forecast changes from that hour on.
 */

import { type Calibration, type CalibrationKey, keyOf, pointsFor } from "./calibrate.ts";
import { type DemandProfile, demandAt } from "./demand.ts";
import { groupBy } from "./timeline.ts";
import {
  type AgentId,
  hourMs,
  type Placement,
  planOf,
  type Seat,
  type SeatId,
  type TokenCounts,
  type WindowKey,
  type WindowReading,
} from "./types.ts";
import { empty, type Level, type Refill, type SeatForecast, WindowWalk } from "./window-walk.ts";

/** One agent's demand now, and the seat it is on. */
export interface AgentDemand {
  readonly agentId: AgentId;
  readonly seatId: SeatId | undefined;
  readonly tokensPerHourP50: number;
  readonly tokensPerHourP90: number;
  readonly idle: boolean;
}

/** What one `seats.forecast` run reads, already loaded by the plugin. */
export interface SeatForecastInput {
  readonly now: string;
  readonly seats: readonly Seat[];
  /** Readings of the seats; the latest one per seat and window is used. */
  readonly readings: readonly WindowReading[];
  /** Placements open now, plus any planned ones (a planned move closes one and starts another). */
  readonly placements: readonly Placement[];
  readonly profiles: readonly DemandProfile[];
  /** Fits of the last nights; the latest one per plan, model and window is used. */
  readonly calibrations: readonly Calibration[];
  /** API model id prefix → per-model weekly window label (`ForecastSettings.modelWindows`). */
  readonly modelWindows: Readonly<Record<string, string>>;
}

/** One run's forecast of every agent and seat window, before the pool and scenarios. */
export interface SeatForecastRun {
  readonly agents: readonly AgentDemand[];
  readonly seats: readonly SeatForecast[];
  readonly refills: readonly Refill[];
  /** Agents on a seat whose model has no fit for one of its windows: they add no points there. */
  readonly uncalibrated: readonly (CalibrationKey & { readonly agentId: AgentId })[];
}

/** Whether an agent's tokens count against a window: all do for `session` and `week`. */
export function countsAgainst(
  window: WindowKey,
  model: string,
  modelWindows: Readonly<Record<string, string>>,
): boolean {
  if (window === "session" || window === "week") {
    return true;
  }
  const label = window.slice("week:".length);
  return Object.entries(modelWindows).some(
    ([prefix, windowLabel]) => windowLabel === label && model.startsWith(prefix),
  );
}

function scaled(mix: TokenCounts, tokens: number): TokenCounts {
  return { input: mix.input * tokens, cached: mix.cached * tokens, output: mix.output * tokens };
}

function latestBy<T>(items: readonly T[], keyOf: (item: T) => string, order: (item: T) => string) {
  const latest = new Map<string, T>();
  for (const [key, group] of groupBy(items, keyOf)) {
    const [newest] = [...group].sort((a, b) => order(b).localeCompare(order(a)));
    if (newest !== undefined) {
      latest.set(key, newest);
    }
  }
  return latest;
}

interface TimedPlacement {
  readonly agentId: AgentId;
  readonly seatId: SeatId;
  readonly fromMs: number;
  readonly toMs: number;
}

/** Prices the agents on a seat at any hour, and notes the ones without a fit. */
class SeatPricing {
  private readonly input: SeatForecastInput;
  private readonly nowMs: number;
  private readonly profiles: Map<AgentId, DemandProfile>;
  private readonly calibrations: Map<string, Calibration>;
  private readonly placements: readonly TimedPlacement[];
  private readonly missing = new Map<string, CalibrationKey & { agentId: AgentId }>();

  constructor(input: SeatForecastInput) {
    this.input = input;
    this.nowMs = Date.parse(input.now);
    this.profiles = new Map(input.profiles.map((profile) => [profile.agentId, profile]));
    this.calibrations = latestBy(input.calibrations, keyOf, (calibration) => calibration.day);
    this.placements = input.placements.map((placement) => ({
      agentId: placement.agentId,
      seatId: placement.seatId,
      fromMs: Date.parse(placement.from),
      toMs: placement.to === undefined ? Number.POSITIVE_INFINITY : Date.parse(placement.to),
    }));
  }

  /** The seat an agent is on at `atMs`. */
  seatOf(agentId: AgentId, atMs: number): SeatId | undefined {
    return this.placements.find(
      (placement) =>
        placement.agentId === agentId && placement.fromMs <= atMs && atMs < placement.toMs,
    )?.seatId;
  }

  /** Points per hour a window of a seat gains at any instant, from the agents on it then. */
  pointsPerHour(seat: Seat, window: WindowKey): (atMs: number) => Level {
    const placements = this.placements.filter((placement) => placement.seatId === seat.id);
    return (atMs) =>
      placements
        .filter((placement) => placement.fromMs <= atMs && atMs < placement.toMs)
        .map((placement) => this.agentPoints(placement.agentId, seat, window, atMs))
        .reduce((sum, level) => ({ p50: sum.p50 + level.p50, p90: sum.p90 + level.p90 }), empty);
  }

  uncalibrated(): (CalibrationKey & { agentId: AgentId })[] {
    return [...this.missing.values()];
  }

  private agentPoints(agentId: AgentId, seat: Seat, window: WindowKey, atMs: number): Level {
    const profile = this.profiles.get(agentId);
    if (profile === undefined || !countsAgainst(window, profile.model, this.input.modelWindows)) {
      return empty;
    }
    const key = { plan: planOf(seat), model: profile.model, window };
    const calibration = this.calibrations.get(keyOf(key));
    if (calibration === undefined) {
      this.missing.set(`${keyOf(key)}|${agentId}`, { ...key, agentId });
      return empty;
    }
    const demand = demandAt(profile, this.nowMs, Math.floor(atMs / hourMs) * hourMs);
    const price = (tokens: number) =>
      pointsFor(calibration.pointsPerMillion, scaled(profile.mix, tokens));
    return { p50: price(demand.p50), p90: price(demand.p90) };
  }
}

/** The forecast for every window of every pool and reserve seat; paid-API seats take no agents. */
export function forecastSeats(input: SeatForecastInput): SeatForecastRun {
  const nowMs = Date.parse(input.now);
  const pricing = new SeatPricing(input);
  const latest = latestBy(
    input.readings,
    (reading) => `${reading.seatId}|${reading.window}`,
    (reading) => reading.at,
  );
  const seats: SeatForecast[] = [];
  const refills: Refill[] = [];
  for (const seat of input.seats) {
    if (seat.status !== "active" || seat.role === "paid-api") {
      continue;
    }
    for (const reading of latest.values()) {
      if (reading.seatId === seat.id) {
        const walk = new WindowWalk(reading, nowMs);
        const result = walk.run(pricing.pointsPerHour(seat, reading.window));
        seats.push(result.forecast);
        refills.push(...result.refills);
      }
    }
  }
  refills.sort((a, b) => a.at.localeCompare(b.at));
  const agents = input.profiles.map((profile): AgentDemand => {
    const demand = demandAt(profile, nowMs, nowMs);
    return {
      agentId: profile.agentId,
      seatId: pricing.seatOf(profile.agentId, nowMs),
      tokensPerHourP50: demand.p50,
      tokensPerHourP90: demand.p90,
      idle: profile.idle,
    };
  });
  return { agents, seats, refills, uncalibrated: pricing.uncalibrated() };
}
