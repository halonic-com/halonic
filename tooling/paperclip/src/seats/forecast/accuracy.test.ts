import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  type AccuracyInput,
  type AccuracyScore,
  accuracy,
  goodDaysInARow,
  type HorizonMinutes,
  type StoredForecastPoint,
  scoreForecasts,
  sessionOneHourDegraded,
} from "./accuracy.ts";
import type { WindowReading } from "./types.ts";

const minuteMs = 60_000;

/** A forecast of made-up `seat-a`'s 5-hour window, made `horizon` minutes before `targetAt`. */
const point = (
  targetAt: string,
  horizon: number,
  p50: number,
  p90: number,
): StoredForecastPoint => ({
  madeAt: new Date(Date.parse(targetAt) - horizon * minuteMs).toISOString(),
  seatId: "seat-a",
  window: "session",
  horizon: horizon as HorizonMinutes,
  targetAt,
  p50,
  p90,
});
const reading = (at: string, usedPercent: number, seatId = "seat-a"): WindowReading => ({
  seatId,
  window: "session",
  at,
  usedPercent,
  resetsAt: undefined,
});
const input = (
  points: StoredForecastPoint[],
  readings: WindowReading[],
  history: AccuracyScore[] = [],
): AccuracyInput => ({ points, readings, readIntervalMs: 10 * minuteMs, history });
const score = (day: string, medianErrorPoints: number): AccuracyScore => ({
  day,
  window: "session",
  horizon: 60,
  samples: 100,
  medianErrorPoints,
  p90ErrorPoints: medianErrorPoints * 2,
  insideBand: 0.4,
});

verifies("paperclip.seats-accuracy", () => {
  test("each point is scored against the reading of its seat and window nearest its target", () => {
    const scores = scoreForecasts(
      input(
        [
          point("2026-11-21T11:00:00.000Z", 60, 40, 50),
          point("2026-11-21T12:00:00.000Z", 60, 40, 50),
          point("2026-11-21T13:00:00.000Z", 60, 40, 50),
        ],
        [
          reading("2026-11-21T11:04:00.000Z", 45),
          reading("2026-11-21T12:00:00.000Z", 38),
          reading("2026-11-21T13:02:00.000Z", 60),
          reading("2026-11-21T13:00:00.000Z", 70, "seat-b"),
        ],
      ),
    );
    expect(scores).toEqual([
      {
        day: "2026-11-21",
        window: "session",
        horizon: 60,
        samples: 3,
        medianErrorPoints: 5,
        p90ErrorPoints: 17,
        insideBand: 1 / 3,
      },
    ]);
  });

  test("horizons are scored apart, and a point with no reading near its target isn't scored", () => {
    const scores = scoreForecasts(
      input(
        [
          point("2026-11-21T15:00:00.000Z", 300, 60, 70),
          point("2026-11-22T10:00:00.000Z", 1440, 60, 70),
          point("2026-11-21T12:00:00.000Z", 120, 60, 70),
        ],
        [
          reading("2026-11-21T15:00:00.000Z", 61),
          reading("2026-11-22T10:30:00.000Z", 10),
          reading("2026-11-21T12:00:00.000Z", 60),
        ],
      ),
    );
    expect(scores.map((s) => [s.horizon, s.samples, s.medianErrorPoints])).toEqual([[300, 1, 1]]);
  });

  test("two days in a row with a 1-hour median error above 3 points degrade the session forecast", () => {
    expect(sessionOneHourDegraded([score("2026-11-20", 3.5), score("2026-11-21", 5)])).toBe(true);
    expect(sessionOneHourDegraded([score("2026-11-20", 2), score("2026-11-21", 5)])).toBe(false);
    expect(sessionOneHourDegraded([score("2026-11-19", 4), score("2026-11-21", 4)])).toBe(false);
    expect(sessionOneHourDegraded([])).toBe(false);
  });

  test("the nightly run raises the flag from a stored bad day and tonight's bad day", () => {
    const report = accuracy(
      input(
        [point("2026-11-21T11:00:00.000Z", 60, 40, 50)],
        [reading("2026-11-21T11:00:00.000Z", 46)],
        [score("2026-11-20", 4)],
      ),
    );
    expect(report.scores.map((s) => s.medianErrorPoints)).toEqual([6]);
    expect(report.sessionOneHourDegraded).toBe(true);
  });

  test("good days are counted back from the newest, stopping at a bad or missing day", () => {
    expect(
      goodDaysInARow([score("2026-11-19", 1), score("2026-11-20", 2), score("2026-11-21", 3)]),
    ).toBe(3);
    expect(
      goodDaysInARow([score("2026-11-19", 1), score("2026-11-20", 4), score("2026-11-21", 1)]),
    ).toBe(1);
    expect(goodDaysInARow([score("2026-11-18", 1), score("2026-11-21", 1)])).toBe(1);
    expect(goodDaysInARow([])).toBe(0);
  });
});
