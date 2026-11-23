import type { PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";
import type { StoredForecastPoint } from "../forecast/accuracy.ts";
import { demandProfile, profileDays } from "../forecast/demand.ts";
import { poolDays } from "../forecast/pool.ts";
import { type ForecastRun, forecastRuns } from "../forecast/scenarios.ts";
import type { SeatForecastInput } from "../forecast/seat-forecast.ts";
import { dayMs, hourMs, windowReadings } from "../forecast/types.ts";
import { counted, forecastSeats } from "./calibrate-job.ts";
import type { ForecastStore } from "./forecast-store.ts";
import type { HistoryStore } from "./history-store.ts";
import { type ReadJobApi, type SeatsOwner, seatsOwner } from "./read-job.ts";
import type { SeatsStore } from "./store.ts";
import type { RecentReadings } from "./stored-readings.ts";

/** The part of the plugin context `seats.forecast` uses, so tests can fake it. */
export interface ForecastJobApi extends ReadJobApi {
  readonly state: Pick<PluginStateClient, "set">;
}

/** What `seats.forecast` reads from and writes to, so tests can fake it. */
export interface ForecastJobDeps {
  readonly readings: RecentReadings;
  readonly history: Pick<HistoryStore, "placementsSince">;
  readonly forecast: Pick<
    ForecastStore,
    | "usageSince"
    | "calibrationsSince"
    | "latestActivity"
    | "saveForecastPoints"
    | "removeForecastPointsBefore"
  >;
  readonly store: Pick<SeatsStore, "manualResets">;
  readonly now: () => Date;
}

/** Readings this old still start a window's walk: the walk rolls past any reset since. */
const readingDays = 1;
/** An agent `seats.history` hasn't seen for this long has left the seats. */
const activityMs = hourMs;
/** Fits this old are still used: a night without calibration leaves the last fit in place. */
const calibrationDays = 8;
/** How long forecast points are kept: `seats.accuracy` scores yesterday, so a week is plenty. */
export const keepForecastPointDays = 7;

function before(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

/** Where the newest runs are kept for the page: plugin state holds only the latest values. */
export function latestForecastKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seats-forecast",
    stateKey: "latest",
  };
}

/** The points `seats.accuracy` scores: only `current`'s, since a scenario never happens. */
function pointsOf(run: ForecastRun): StoredForecastPoint[] {
  return run.seats.flatMap((seat) =>
    seat.points.map((point) => ({
      ...point,
      madeAt: run.madeAt,
      seatId: seat.seatId,
      window: seat.window,
    })),
  );
}

/** Loads everything one run reads, as of `now`. */
async function forecastInput(deps: ForecastJobDeps, owner: SeatsOwner, now: Date) {
  const at = now.toISOString();
  const activity = await deps.forecast.latestActivity(before(now, activityMs));
  const usage = await deps.forecast.usageSince(before(now, profileDays * dayMs));
  const input: SeatForecastInput = {
    now: at,
    seats: forecastSeats(owner.settings, await deps.store.manualResets(), at),
    readings: windowReadings(await deps.readings.since(before(now, readingDays * dayMs))),
    placements: await deps.history.placementsSince(at),
    profiles: activity.map((row) => demandProfile(row, usage, at)),
    calibrations: await deps.forecast.calibrationsSince(
      before(now, calibrationDays * dayMs).slice(0, "2026-11-22".length),
    ),
    modelWindows: owner.settings.forecast.modelWindows,
  };
  return { input, activity };
}

/**
 * The `seats.forecast` job, every 10 minutes: forecasts each agent's demand,
 * each seat window to its reset, the capacity coming free and the pool,
 * under `current` and each scenario in the settings. It stores `current`'s
 * forecast points for `seats.accuracy` and keeps the newest runs for the
 * page. It proposes and changes nothing, and logs counts only.
 */
export async function runSeatsForecast(ctx: ForecastJobApi, deps: ForecastJobDeps): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const now = deps.now();
  const { input, activity } = await forecastInput(deps, owner, now);
  const runs = forecastRuns(input, activity, owner.settings.forecast.scenarios);
  const [current] = runs;
  if (current === undefined) {
    return;
  }
  const points = pointsOf(current);
  await deps.forecast.saveForecastPoints(points);
  await deps.forecast.removeForecastPointsBefore(before(now, keepForecastPointDays * dayMs));
  await ctx.state.set(latestForecastKey(owner.companyId), runs);
  const headroom = current.pool.headroomDaysP50;
  const runOut =
    headroom === undefined ? `none within ${poolDays} days` : `in ${headroom.toFixed(1)} days`;
  const uncalibrated = new Set(current.uncalibrated.map((missing) => missing.agentId)).size;
  ctx.logger.info(
    `seats.forecast: ${counted(current.seats.length, "seat window")}, ${counted(runs.length - 1, "scenario")}, ${counted(points.length, "forecast point")} stored, ${counted(uncalibrated, "agent")} without a fit for a window; pool run-out (P50) ${runOut}.`,
    { companyId: owner.companyId },
  );
}
