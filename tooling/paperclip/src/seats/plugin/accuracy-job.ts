import type { PluginLogger, PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";
import {
  type AccuracyScore,
  accuracy,
  alertDays,
  alertMedianError,
  goodDaysInARow,
} from "../forecast/accuracy.ts";
import { bucketMs, dayMs, windowReadings } from "../forecast/types.ts";
import type { AccuracyStore } from "./accuracy-store.ts";
import { counted } from "./calibrate-job.ts";
import { type ReadJobApi, seatsOwner } from "./read-job.ts";
import type { RecentReadings } from "./stored-readings.ts";

/** The part of the plugin context `seats.accuracy` uses, so tests can fake it. */
export interface AccuracyJobApi extends Omit<ReadJobApi, "logger"> {
  readonly logger: Pick<PluginLogger, "info" | "warn" | "error">;
  readonly state: Pick<PluginStateClient, "set">;
}

/** What `seats.accuracy` reads from and writes to, so tests can fake it. */
export interface AccuracyJobDeps {
  readonly readings: RecentReadings;
  readonly scores: AccuracyStore;
  readonly now: () => Date;
}

/** Automatic moves (phase 4) need this many good days in a row; older scores can't change the count. */
export const phaseFourDays = 14;
/** How long scores are kept: past `phaseFourDays`, so the page and Grafana can show a month. */
export const keepAccuracyDays = 30;

/** The newest night's result, kept in plugin state for the page: plugin state holds only the latest values. */
export interface LatestAccuracy {
  readonly day: string;
  readonly scores: readonly AccuracyScore[];
  /** The alert: the 5-hour window's 1-hour forecasts were off by a median of more than 3 points on 2 days in a row. */
  readonly sessionOneHourDegraded: boolean;
  readonly goodDaysInARow: number;
}

export function latestAccuracyKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seats-accuracy",
    stateKey: "latest",
  };
}

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function dayBefore(day: string, back: number): string {
  return new Date(dayStart(day) - back * dayMs).toISOString().slice(0, "2026-11-22".length);
}

/** The 1-hour median error of the 5-hour window, for the log line. */
function sessionOneHour(scores: readonly AccuracyScore[]): string {
  const score = scores.find((s) => s.window === "session" && s.horizon === 60);
  return score === undefined ? "not scored" : `${score.medianErrorPoints.toFixed(1)} points`;
}

/**
 * The nightly `seats.accuracy` job: scores yesterday's (UTC) forecast points
 * against the readings near their target times, stores the scores, keeps the
 * newest result for the page, and raises the alert as a warning in the log
 * when the 5-hour window's 1-hour forecasts were off on 2 days in a row.
 * Grafana alerts on the stored scores. It proposes and changes nothing, and
 * logs counts only.
 */
export async function runSeatsAccuracy(ctx: AccuracyJobApi, deps: AccuracyJobDeps): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const today = deps.now().toISOString().slice(0, "2026-11-22".length);
  const day = dayBefore(today, 1);
  const from = dayStart(day);
  const points = await deps.scores.forecastPointsTargeting(
    new Date(from).toISOString(),
    new Date(from + dayMs).toISOString(),
  );
  const history = await deps.scores.accuracyScoresSince(dayBefore(day, phaseFourDays));
  const report = accuracy({
    day,
    points,
    // `seats.read` reads each seat once in every usage bucket; one on each side of the day counts.
    readings: windowReadings(await deps.readings.since(new Date(from - bucketMs).toISOString())),
    readIntervalMs: bucketMs,
    history,
  });
  await deps.scores.saveAccuracyScores(report.scores);
  await deps.scores.removeAccuracyScoresBefore(dayBefore(day, keepAccuracyDays));
  const streak = goodDaysInARow([...history, ...report.scores], day);
  const latest: LatestAccuracy = {
    day,
    scores: report.scores,
    sessionOneHourDegraded: report.sessionOneHourDegraded,
    goodDaysInARow: streak,
  };
  await ctx.state.set(latestAccuracyKey(owner.companyId), latest);
  const scored = report.scores.reduce((sum, score) => sum + score.samples, 0);
  ctx.logger.info(
    `seats.accuracy: ${day}: ${counted(scored, "forecast point")} scored of ${points.length}, ${counted(report.scores.length, "score")} stored; 1-hour median error of the 5-hour window ${sessionOneHour(report.scores)}; ${counted(streak, "good day")} in a row (automatic moves need ${phaseFourDays}).`,
    { companyId: owner.companyId },
  );
  if (report.sessionOneHourDegraded) {
    ctx.logger.warn(
      `seats.accuracy: the 5-hour window's 1-hour forecasts were off by a median of more than ${alertMedianError} points on ${alertDays} days in a row, up to ${day}.`,
      { companyId: owner.companyId },
    );
  }
}
