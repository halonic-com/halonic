/**
 * The forecast effect of a proposal (`seats.plan`): what a move or a manual
 * reset would do to the seats it touches and to the pool. The placement
 * rules (`placement-rules.ts`) decide which moves and resets to propose; this
 * only prices them, so the board sees each proposal next to its effect.
 *
 * Each proposal is forecast on its own against today's forecast, so two
 * moves onto the same seat each show their own effect, not the sum. Nothing
 * here is applied: moves and resets stay the board's decision.
 */

import { forecastPool } from "./pool.ts";
import { forecastSeats, type SeatForecastInput, SeatPricing } from "./seat-forecast.ts";
import type { AgentId, Placement, SeatId, WindowKey, WindowReading } from "./types.ts";
import type { Level, SeatForecast } from "./window-walk.ts";

/** A move to forecast: the agent leaves the seat it is on at `at` for `toSeatId`. */
export interface PlannedMove {
  readonly agentId: AgentId;
  readonly toSeatId: SeatId;
  readonly at: string;
}

/** One window of a touched seat: its % at reset today and with the proposal. */
export interface WindowChange {
  readonly seatId: SeatId;
  readonly window: WindowKey;
  readonly before: Level;
  readonly after: Level;
}

/** When the pool runs out, P50 and P90; undefined when it lasts the pool forecast's two weeks. */
export interface PoolRunOut {
  readonly p50: string | undefined;
  readonly p90: string | undefined;
}

/** What a proposal changes in the forecast. */
export interface ForecastEffect {
  /** Every window of the seats the proposal touches. */
  readonly windows: readonly WindowChange[];
  readonly poolBefore: PoolRunOut;
  readonly poolAfter: PoolRunOut;
}

/** A move's effect; `fromSeatId` is undefined when the agent is on no seat at the move's time. */
export interface MoveEffect extends ForecastEffect {
  readonly move: PlannedMove;
  readonly fromSeatId: SeatId | undefined;
}

/** A manual reset's effect on its seat and the pool. */
export interface ResetEffect extends ForecastEffect {
  readonly seatId: SeatId;
}

interface Outcome {
  readonly seats: readonly SeatForecast[];
  readonly pool: PoolRunOut;
}

function outcome(input: SeatForecastInput): Outcome {
  const pool = forecastPool(input);
  return {
    seats: forecastSeats(input).seats,
    pool: { p50: pool.runOutAtP50, p90: pool.runOutAtP90 },
  };
}

const windowKey = (forecast: SeatForecast) => `${forecast.seatId}|${forecast.window}`;
const atReset = (forecast: SeatForecast): Level => ({
  p50: forecast.atResetP50,
  p90: forecast.atResetP90,
});

/** The change between two outcomes, for the windows of `seatIds` only. */
function compare(
  before: Outcome,
  after: Outcome,
  seatIds: ReadonlySet<SeatId | undefined>,
): ForecastEffect {
  const beforeByWindow = new Map(before.seats.map((forecast) => [windowKey(forecast), forecast]));
  const windows: WindowChange[] = [];
  for (const forecast of after.seats) {
    const old = beforeByWindow.get(windowKey(forecast));
    if (seatIds.has(forecast.seatId) && old !== undefined) {
      windows.push({
        seatId: forecast.seatId,
        window: forecast.window,
        before: atReset(old),
        after: atReset(forecast),
      });
    }
  }
  return { windows, poolBefore: before.pool, poolAfter: after.pool };
}

/**
 * The placements with one move made: the placement the agent is on at the
 * move's time ends then, and a new one starts on the target seat, ending
 * where the old one would have (so a later planned move still happens).
 */
export function withMove(placements: readonly Placement[], move: PlannedMove): Placement[] {
  const atMs = Date.parse(move.at);
  const covers = (placement: Placement) =>
    placement.agentId === move.agentId &&
    Date.parse(placement.from) <= atMs &&
    (placement.to === undefined || atMs < Date.parse(placement.to));
  const current = placements.find(covers);
  const moved = placements.map((placement) =>
    placement === current ? { ...placement, to: move.at } : placement,
  );
  return [
    ...moved,
    { agentId: move.agentId, seatId: move.toSeatId, from: move.at, to: current?.to, source: "job" },
  ];
}

/** The forecast effect of each move, each on its own against today's forecast. */
export function moveEffects(input: SeatForecastInput, moves: readonly PlannedMove[]): MoveEffect[] {
  const before = outcome(input);
  const pricing = new SeatPricing(input);
  return moves.map((move) => {
    const fromSeatId = pricing.seatOf(move.agentId, Date.parse(move.at));
    const after = outcome({ ...input, placements: withMove(input.placements, move) });
    const touched = new Set([fromSeatId, move.toSeatId]);
    return { move, fromSeatId, ...compare(before, after, touched) };
  });
}

/**
 * The readings with a manual reset of one seat at `now`: every window of the
 * seat reads 0% then and keeps its reset time.
 */
export function withReset(input: SeatForecastInput, seatId: SeatId): WindowReading[] {
  const latest = new Map<WindowKey, WindowReading>();
  for (const reading of input.readings) {
    const newest = latest.get(reading.window);
    if (reading.seatId === seatId && (newest === undefined || reading.at > newest.at)) {
      latest.set(reading.window, reading);
    }
  }
  const emptied = [...latest.values()].map(
    (reading): WindowReading => ({ ...reading, at: input.now, usedPercent: 0 }),
  );
  // The seat's older readings go, so one taken at `now` itself can't outrank the reset.
  return [...input.readings.filter((reading) => reading.seatId !== seatId), ...emptied];
}

/** The forecast effect of a manual reset of each seat, each on its own against today's forecast. */
export function resetEffects(input: SeatForecastInput, seatIds: readonly SeatId[]): ResetEffect[] {
  const before = outcome(input);
  return seatIds.map((seatId) => {
    const after = outcome({ ...input, readings: withReset(input, seatId) });
    return { seatId, ...compare(before, after, new Set([seatId])) };
  });
}
