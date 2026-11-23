import { calibrate, calibrationDays } from "../forecast/calibrate.ts";
import { bucketMs, dayMs, type Seat, windowReadings } from "../forecast/types.ts";
import type { SeatEvent } from "../records.ts";
import { seatStates } from "../seat-state.ts";
import type { ForecastStore } from "./forecast-store.ts";
import type { HistoryStore } from "./history-store.ts";
import { type ReadJobApi, seatsOwner } from "./read-job.ts";
import type { SeatsSettings } from "./settings.ts";
import type { SeatsStore } from "./store.ts";
import type { RecentReadings } from "./stored-readings.ts";

export interface CalibrateJobDeps {
  readonly readings: RecentReadings;
  readonly history: Pick<HistoryStore, "placementsSince">;
  readonly forecast: Pick<
    ForecastStore,
    "usageSince" | "calibrationsSince" | "saveCalibrations" | "removeCalibrationsBefore"
  >;
  readonly store: Pick<SeatsStore, "manualResets">;
  readonly now: () => Date;
}

/** The fits of the 8 days before: `calibrate` measures each new fit's shift against them. */
const historyDays = 8;
/** How long fits are kept: well past `historyDays`, so the page can show the last one. */
export const keepCalibrationDays = 30;

/**
 * The seats in the settings as the forecast sees them. The settings name no
 * plan yet, so every seat is calibrated under the plan `unknown`; the
 * manual resets the board recorded say which reset groups have used theirs.
 */
export function forecastSeats(
  settings: SeatsSettings,
  manualResets: readonly SeatEvent[],
  now: string,
): Seat[] {
  return seatStates(settings.seats, [], manualResets, now).map((seat) => ({
    id: seat.id,
    role: seat.role,
    plan: undefined,
    resetGroup: seat.resetGroup,
    manualResetUsed: seat.manualResetUsed,
    status: seat.status,
  }));
}

/** A count for a log line: "1 fit", "2 fits". */
export function counted(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

function dayBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * dayMs).toISOString().slice(0, "2026-11-22".length);
}

/**
 * The nightly `seats.calibrate` job: loads the last 7 days of readings,
 * placements and usage, fits what a million tokens cost each window, and
 * stores the fits. It logs counts only, among them the steps it skipped
 * because their tokens were on no seat: many of those mean the plugin can't
 * tell where some agents run, and the fits rest on fewer steps.
 */
export async function runSeatsCalibrate(ctx: ReadJobApi, deps: CalibrateJobDeps): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const now = deps.now();
  const at = now.toISOString();
  const since = new Date(now.getTime() - calibrationDays * dayMs).toISOString();
  const run = calibrate({
    now: at,
    seats: forecastSeats(owner.settings, await deps.store.manualResets(), at),
    readings: windowReadings(await deps.readings.since(since)),
    // `seats.read` reads each seat once in every usage bucket.
    readIntervalMs: bucketMs,
    placements: await deps.history.placementsSince(since),
    usage: await deps.forecast.usageSince(since),
    history: await deps.forecast.calibrationsSince(dayBefore(now, historyDays)),
  });
  await deps.forecast.saveCalibrations(run.calibrations);
  await deps.forecast.removeCalibrationsBefore(dayBefore(now, keepCalibrationDays));
  const shifted = run.calibrations.filter((fit) => fit.shifted).length;
  ctx.logger.info(
    `seats.calibrate: ${counted(run.calibrations.length, "fit")} stored (${shifted} moved more than 25% in a week), ${run.tooFewSteps.length} without enough steps, ${counted(run.unplacedSteps, "step")} skipped because their tokens were on no seat.`,
    { companyId: owner.companyId },
  );
}
