import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  type AccuracyScore,
  accuracyAlerts,
  goodDaysInARow,
  type Outcome,
  type StoredForecast,
  scoreForecasts,
} from "./accuracy.ts";

const forecast = (
  madeAt: string,
  horizonHours: number,
  p50: number,
  p90: number,
): StoredForecast => ({
  scope: "seat-session",
  subject: "seat-a",
  madeAt,
  horizonHours,
  p50,
  p90,
});
const outcome = (at: string, value: number, subject = "seat-a"): Outcome => ({
  scope: "seat-session",
  subject,
  at,
  value,
});
const score = (day: string, medianError: number): AccuracyScore => ({
  day,
  scope: "seat-session",
  horizonHours: 1,
  scored: 100,
  medianError,
  p90Error: medianError * 2,
  insideBand: 0.4,
  atOrBelowP90: 0.9,
});

verifies("paperclip.seats-accuracy", () => {
  test("each forecast is scored against the reading nearest its time", () => {
    const scores = scoreForecasts(
      [
        forecast("2026-11-21T10:00:00.000Z", 1, 40, 50),
        forecast("2026-11-21T11:00:00.000Z", 1, 40, 50),
        forecast("2026-11-21T12:00:00.000Z", 1, 40, 50),
      ],
      [
        outcome("2026-11-21T11:04:00.000Z", 45),
        outcome("2026-11-21T12:00:00.000Z", 38),
        outcome("2026-11-21T13:02:00.000Z", 60),
        outcome("2026-11-21T13:00:00.000Z", 70, "seat-b"),
      ],
    );
    expect(scores).toEqual([
      {
        day: "2026-11-21",
        scope: "seat-session",
        horizonHours: 1,
        scored: 3,
        medianError: 5,
        p90Error: 17,
        insideBand: 1 / 3,
        atOrBelowP90: 2 / 3,
      },
    ]);
  });

  test("horizons are scored apart, and a forecast with no reading near its time isn't scored", () => {
    const scores = scoreForecasts(
      [
        forecast("2026-11-21T10:00:00.000Z", 5, 60, 70),
        forecast("2026-11-21T10:00:00.000Z", 24, 60, 70),
        forecast("2026-11-21T10:00:00.000Z", 2, 60, 70),
      ],
      [outcome("2026-11-21T15:00:00.000Z", 61), outcome("2026-11-22T10:30:00.000Z", 10)],
    );
    expect(scores.map((s) => [s.horizonHours, s.scored, s.medianError])).toEqual([[5, 1, 1]]);
  });

  test("two days in a row with a 1-hour median error above 3 points raise the alert", () => {
    const scores = [
      score("2026-11-18", 4),
      score("2026-11-19", 2),
      score("2026-11-20", 3.5),
      score("2026-11-21", 5),
    ];
    expect(accuracyAlerts(scores)).toEqual(["2026-11-21"]);
    expect(accuracyAlerts([score("2026-11-19", 4), score("2026-11-21", 4)])).toEqual([]);
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
