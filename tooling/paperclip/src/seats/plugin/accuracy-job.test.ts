import { verifies } from "@halonicjs/testing-spec";
import type { ScopeKey } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import type { AccuracyScore, StoredForecastPoint } from "../forecast/accuracy.ts";
import type { SeatReading } from "../records.ts";
import {
  type AccuracyJobApi,
  type AccuracyJobDeps,
  type LatestAccuracy,
  runSeatsAccuracy,
} from "./accuracy-job.ts";

// Made-up company, seat, folder and connection only.
const settings = {
  seats: [{ id: "seat-a", role: "pool", configDir: "/srv/seats/a", connectionId: "conn-a" }],
};
const now = new Date("2026-11-23T00:40:00.000Z");

/** A 1-hour forecast of `seat-a`'s 5-hour window for 10:00 yesterday, at P50 40 and P90 50. */
const point: StoredForecastPoint = {
  madeAt: "2026-11-22T09:00:00.000Z",
  seatId: "seat-a",
  window: "session",
  horizon: 60,
  targetAt: "2026-11-22T10:00:00.000Z",
  p50: 40,
  p90: 50,
};

/** `seat-a` read two minutes after the point's target. */
function reading(usedPercent: number): SeatReading {
  return {
    seatId: "seat-a",
    at: "2026-11-22T10:02:00.000Z",
    error: undefined,
    session: { usedPercent, resetsAt: "2026-11-22T12:00:00.000Z" },
    week: undefined,
    weekByModel: {},
  };
}

/** A stored 1-hour score of the 5-hour window. */
function stored(day: string, medianErrorPoints: number): AccuracyScore {
  return {
    day,
    window: "session",
    horizon: 60,
    samples: 140,
    medianErrorPoints,
    p90ErrorPoints: medianErrorPoints * 2,
    insideBand: 0.4,
  };
}

interface SetupOptions {
  readonly settings?: Record<string, unknown>;
  readonly actual?: number;
  readonly history?: AccuracyScore[];
}

function setup(options: SetupOptions = {}) {
  const logs: string[] = [];
  const warnings: string[] = [];
  const saved: AccuracyScore[] = [];
  const asked: string[] = [];
  const state = new Map<string, unknown>();
  const ctx: AccuracyJobApi = {
    companies: { list: async () => [{ id: "acme" } as never] },
    config: { get: async () => options.settings ?? settings },
    logger: {
      info: (message) => void logs.push(message),
      warn: (message) => void warnings.push(message),
      error: () => undefined,
    },
    state: { set: async (key: ScopeKey, value) => void state.set(key.stateKey, value) },
  };
  const deps: AccuracyJobDeps = {
    readings: {
      since: async (since) => {
        asked.push(`readings since ${since}`);
        return [reading(options.actual ?? 45)];
      },
    },
    scores: {
      forecastPointsTargeting: async (from, to) => {
        asked.push(`points ${from} to ${to}`);
        return [point];
      },
      accuracyScoresSince: async (day) => {
        asked.push(`scores since ${day}`);
        return options.history ?? [stored("2026-11-21", 4)];
      },
      saveAccuracyScores: async (scores) => void saved.push(...scores),
      removeAccuracyScoresBefore: async (day) => void asked.push(`remove before ${day}`),
    },
    now: () => now,
  };
  return { ctx, deps, logs, warnings, saved, asked, state };
}

verifies("paperclip.seats-accuracy-job", () => {
  test("scores yesterday, stores the scores and warns after a second bad day", async () => {
    const { ctx, deps, logs, warnings, saved, state } = setup();

    await runSeatsAccuracy(ctx, deps);

    expect(saved).toEqual([
      {
        day: "2026-11-22",
        window: "session",
        horizon: 60,
        samples: 1,
        medianErrorPoints: 5,
        p90ErrorPoints: 5,
        insideBand: 1,
      },
    ]);
    const latest = state.get("latest") as LatestAccuracy;
    expect(latest.sessionOneHourDegraded).toBe(true);
    expect(logs).toEqual([
      "seats.accuracy: 2026-11-22: 1 forecast point scored of 1, 1 score stored; 1-hour median error of the 5-hour window 5.0 points; 0 good days in a row (automatic moves need 14).",
    ]);
    expect(warnings).toEqual([
      "seats.accuracy: the 5-hour window's 1-hour forecasts were off by a median of more than 3 points on 2 days in a row, up to 2026-11-22.",
    ]);
    expect([...logs, ...warnings].join("\n")).not.toMatch(/\/srv\/|conn-|seat-a/);
  });

  test("gives no warning on a good day and counts the good days in a row", async () => {
    const { ctx, deps, logs, warnings, state } = setup({
      actual: 41,
      history: [stored("2026-11-20", 1), stored("2026-11-21", 2)],
    });

    await runSeatsAccuracy(ctx, deps);

    expect(warnings).toEqual([]);
    expect((state.get("latest") as LatestAccuracy).goodDaysInARow).toBe(3);
    expect(logs[0]).toContain("3 good days in a row");
  });

  test("loads yesterday's points, its readings with one read interval before, and two weeks of scores", async () => {
    const { ctx, deps, asked } = setup();

    await runSeatsAccuracy(ctx, deps);

    expect(asked).toEqual([
      "points 2026-11-22T00:00:00.000Z to 2026-11-23T00:00:00.000Z",
      "scores since 2026-11-08",
      "readings since 2026-11-21T23:50:00.000Z",
      "remove before 2026-10-23",
    ]);
  });

  test("reads and stores nothing when no company lists seats", async () => {
    const { ctx, deps, asked, saved, state } = setup({ settings: { seats: [] } });

    await runSeatsAccuracy(ctx, deps);

    expect(asked).toEqual([]);
    expect(saved).toEqual([]);
    expect(state.size).toBe(0);
  });
});
