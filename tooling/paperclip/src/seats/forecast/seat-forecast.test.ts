import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Calibration } from "./calibrate.ts";
import type { DemandProfile } from "./demand.ts";
import { countsAgainst, forecastSeats, type SeatForecastInput } from "./seat-forecast.ts";
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

/** A made-up agent using `tokensPerHour` output tokens every hour, busy hours twice that. */
const agent = (agentId: string, model = "claude-opus-x", tokensPerHour = 1_000_000) =>
  ({
    agentId,
    model,
    mix: { input: 0, cached: 0, output: 1 },
    idle: false,
    currentRate: tokensPerHour,
    weekProfile: new Array<number>(168).fill(tokensPerHour),
    spread: 2,
  }) satisfies DemandProfile;

const placed = (agentId: string, seatId: string, from = at(-24), to?: string): Placement => ({
  agentId,
  seatId,
  from,
  to,
  source: "supervisor",
});

/** 10 points of the 5-hour window, or 1 of the week, per million output tokens. */
const priced = (
  window: Calibration["window"],
  output: number,
  day = "2026-11-22",
): Calibration => ({
  plan: "max",
  model: "claude-opus-x",
  window,
  day,
  from: at(-168),
  to: at(-1),
  pointsPerMillion: { input: 0, cached: 0, output },
  quality: { steps: 500, medianErrorPoints: 1, p90ErrorPoints: 2 },
  weekShift: undefined,
  shifted: false,
});

const reading = (seatId: string, usedPercent: number, resetsAt: string): WindowReading => ({
  seatId,
  window: "session",
  at: now,
  usedPercent,
  resetsAt,
});

const base: SeatForecastInput = {
  now,
  seats: [seat("seat-a"), seat("seat-b", "reserve")],
  readings: [reading("seat-a", 40, at(3))],
  placements: [placed("agent-1", "seat-a")],
  profiles: [agent("agent-1")],
  calibrations: [priced("session", 10), priced("week", 1)],
  modelWindows: { "claude-sonnet-": "Sonnet" },
};

verifies("paperclip.seats-seat-forecast", () => {
  test("a seat's 5-hour window grows by its agents' points until its reset", () => {
    const [session] = forecastSeats(base).seats;
    expect(session?.atResetP50).toBeCloseTo(70);
    expect(session?.atResetP90).toBeCloseTo(100);
    expect(session?.resetsAt).toBe(at(3));
    expect(session?.crossings).toEqual([
      { threshold: 80, atP50: undefined, atP90: at(2) },
      { threshold: 90, atP50: undefined, atP90: at(2.5) },
      { threshold: 100, atP50: undefined, atP90: at(3) },
    ]);
  });

  test("forecast points 1, 5 and 24 hours ahead run on past each reset", () => {
    const [session] = forecastSeats(base).seats;
    expect(session?.points.map((point) => [point.horizon, point.p50])).toEqual([
      [60, 50],
      [300, 20],
      [1440, 10],
    ]);
  });

  test("capacity coming free lists every reset of the next 7 days with its points", () => {
    const refills = forecastSeats(base).refills;
    expect(refills.slice(0, 2)).toEqual([
      { seatId: "seat-a", window: "session", at: at(3), points: 70 },
      { seatId: "seat-a", window: "session", at: at(8), points: 50 },
    ]);
    expect(refills).toHaveLength(Math.floor((168 - 3) / 5) + 1);
  });

  test("a planned move changes both seats' forecasts from the hour it happens", () => {
    const moved = forecastSeats({
      ...base,
      readings: [reading("seat-a", 40, at(3)), reading("seat-b", 0, at(3))],
      placements: [placed("agent-1", "seat-a", at(-24), at(1)), placed("agent-1", "seat-b", at(1))],
    });
    expect(moved.seats.map((forecast) => [forecast.seatId, forecast.atResetP50])).toEqual([
      ["seat-a", 50],
      ["seat-b", 20],
    ]);
  });

  test("a window already past a threshold crossed it at the reading", () => {
    const [session] = forecastSeats({ ...base, readings: [reading("seat-a", 85, at(3))] }).seats;
    expect(session?.crossings[0]).toEqual({ threshold: 80, atP50: now, atP90: now });
    expect(session?.atResetP50).toBe(100);
  });

  test("a per-model weekly window counts only the models settings map to it", () => {
    expect(countsAgainst("week:Sonnet", "claude-sonnet-y", base.modelWindows)).toBe(true);
    expect(countsAgainst("week:Sonnet", "claude-opus-x", base.modelWindows)).toBe(false);
    expect(countsAgainst("session", "claude-sonnet-y", base.modelWindows)).toBe(true);
  });

  test("an agent whose model has no fit adds no points and is listed", () => {
    const run = forecastSeats({ ...base, profiles: [agent("agent-1", "claude-haiku-z")] });
    expect(run.seats[0]?.atResetP50).toBe(40);
    expect(run.uncalibrated).toEqual([
      { plan: "max", model: "claude-haiku-z", window: "session", agentId: "agent-1" },
    ]);
  });

  test("the newest fit is used, and paid-API seats get no forecast", () => {
    const run = forecastSeats({
      ...base,
      seats: [...base.seats, seat("seat-paid", "paid-api")],
      readings: [...base.readings, reading("seat-paid", 10, at(3))],
      calibrations: [priced("session", 20, "2026-11-21"), priced("session", 10)],
    });
    expect(run.seats.map((forecast) => forecast.seatId)).toEqual(["seat-a"]);
    expect(run.seats[0]?.atResetP50).toBeCloseTo(70);
  });

  test("each agent's demand now names the seat it is on", () => {
    expect(forecastSeats(base).agents).toEqual([
      {
        agentId: "agent-1",
        seatId: "seat-a",
        tokensPerHourP50: 1_000_000,
        tokensPerHourP90: 2_000_000,
        idle: false,
      },
    ]);
  });
});
