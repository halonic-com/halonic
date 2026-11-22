import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Calibration } from "./calibrate.ts";
import type { DemandProfile } from "./demand.ts";
import { forecastPool } from "./pool.ts";
import type { SeatForecastInput } from "./seat-forecast.ts";
import { hourMs, type Placement, type Seat, type WindowReading } from "./types.ts";

const now = "2026-11-22T12:00:00.000Z";
const nowMs = Date.parse(now);
const at = (hours: number) => new Date(nowMs + hours * hourMs).toISOString();

const seat = (id: string, role: Seat["role"] = "pool"): Seat => ({
  id,
  role,
  plan: "max",
  resetGroup: undefined,
  manualResetUsed: false,
  status: "active",
});

/** A made-up agent using `millionsPerHour` million output tokens every hour, busy hours twice that. */
const agent = (agentId: string, millionsPerHour: number) =>
  ({
    agentId,
    model: "claude-opus-x",
    mix: { input: 0, cached: 0, output: 1 },
    idle: false,
    currentRate: millionsPerHour * 1_000_000,
    weekProfile: new Array<number>(168).fill(millionsPerHour * 1_000_000),
    spread: 2,
  }) satisfies DemandProfile;

const placed = (agentId: string, seatId: string): Placement => ({
  agentId,
  seatId,
  from: at(-24),
  to: undefined,
  source: "supervisor",
});

/** One weekly point per million output tokens. */
const weekFit: Calibration = {
  plan: "max",
  model: "claude-opus-x",
  window: "week",
  day: "2026-11-22",
  from: at(-168),
  to: at(-1),
  pointsPerMillion: { input: 0, cached: 0, output: 1 },
  quality: { steps: 500, medianErrorPoints: 1, p90ErrorPoints: 2 },
  weekShift: undefined,
  shifted: false,
};

const week = (seatId: string, usedPercent: number, resetsAt: string): WindowReading => ({
  seatId,
  window: "week",
  at: now,
  usedPercent,
  resetsAt,
});

/** Two seats with 10 and 50 weekly points left, resetting in 2 and about 4 days. */
const pool = (millionsPerHour: number): SeatForecastInput => ({
  now,
  seats: [seat("seat-a"), seat("seat-b", "reserve")],
  readings: [week("seat-a", 90, at(48)), week("seat-b", 50, at(100))],
  placements: [placed("agent-1", "seat-a")],
  profiles: [agent("agent-1", millionsPerHour)],
  calibrations: [weekFit],
  modelWindows: {},
});

verifies("paperclip.seats-pool", () => {
  test("the pool runs out when the points left are spent before the next reset", () => {
    const forecast = forecastPool(pool(3));
    expect(forecast.pointsLeft).toBe(60);
    expect(forecast.runOutAtP50).toBe(at(20));
    expect(forecast.runOutAtP90).toBe(at(10));
    expect(forecast.headroomDaysP50).toBeCloseTo(20 / 24);
  });

  test("a seat's weekly reset puts its points back, spent soonest reset first", () => {
    const forecast = forecastPool({
      ...pool(3),
      readings: [week("seat-a", 90, at(5)), week("seat-b", 50, at(100))],
    });
    // 15 points by the reset at 5 h, then 145 left: seat-b's 45 and seat-a's 100.
    expect(Date.parse(forecast.runOutAtP50 ?? "")).toBeCloseTo(nowMs + (5 + 145 / 3) * hourMs);
  });

  test("a pool used slower than it refills doesn't run out within 14 days", () => {
    const forecast = forecastPool(pool(1));
    expect(forecast.runOutAtP50).toBeUndefined();
    expect(forecast.headroomDaysP50).toBeUndefined();
    expect(forecast.runOutAtP90).toBe(at(30));
  });

  test("usage now and the sustainable rate in points and tokens a day", () => {
    const forecast = forecastPool(pool(1));
    expect(forecast.seats).toBe(2);
    expect(forecast.pointsPerDayNow).toEqual({ p50: 24, p90: 48 });
    expect(forecast.tokensPerDayNow).toEqual({ p50: 24_000_000, p90: 48_000_000 });
    expect(forecast.sustainablePointsPerDay).toBeCloseTo(200 / 7);
    expect(forecast.sustainableTokensPerDay).toBeCloseTo((200 / 7) * 1_000_000);
  });

  test("paid-API seats and seats without a weekly reading are left out", () => {
    const forecast = forecastPool({
      ...pool(1),
      seats: [
        seat("seat-a"),
        seat("seat-b", "reserve"),
        seat("seat-c"),
        seat("seat-paid", "paid-api"),
      ],
      readings: [...pool(1).readings, week("seat-paid", 0, at(50))],
    });
    expect(forecast.seats).toBe(2);
    expect(forecast.pointsLeft).toBe(60);
  });

  test("with no priced demand there is no tokens-per-point to give a sustainable token rate", () => {
    const forecast = forecastPool({ ...pool(1), calibrations: [] });
    expect(forecast.sustainableTokensPerDay).toBeUndefined();
    expect(forecast.runOutAtP90).toBeUndefined();
  });

  test("a pool already full everywhere has run out now", () => {
    const forecast = forecastPool({
      ...pool(1),
      readings: [week("seat-a", 100, at(48)), week("seat-b", 100, at(100))],
    });
    expect(forecast.runOutAtP50).toBe(now);
    expect(forecast.headroomDaysP50).toBe(0);
  });
});
