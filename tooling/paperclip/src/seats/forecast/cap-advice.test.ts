import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Calibration } from "./calibrate.ts";
import { adviseCaps, nextBigRefill } from "./cap-advice.ts";
import type { DemandProfile } from "./demand.ts";
import type { SeatForecastInput } from "./seat-forecast.ts";
import { type AgentActivity, hourMs, type Seat } from "./types.ts";

const now = "2026-11-22T12:00:00.000Z";
const nowMs = Date.parse(now);
const at = (hours: number) => new Date(nowMs + hours * hourMs).toISOString();

const seat: Seat = {
  id: "seat-a",
  role: "pool",
  plan: "max",
  resetGroup: undefined,
  manualResetUsed: false,
  status: "active",
};

/** A made-up agent using `millions` million output tokens every hour. */
const agent = (agentId: string, millions: number): DemandProfile => ({
  agentId,
  model: "claude-opus-x",
  mix: { input: 0, cached: 0, output: 1 },
  idle: false,
  currentRate: millions * 1_000_000,
  weekProfile: new Array<number>(168).fill(millions * 1_000_000),
  spread: 2,
});

/** An agent with a cap of 3 and 4 runs on: each cap cut costs it a third of its runs. */
const activity = (agentId: string, cap: number | undefined): AgentActivity => ({
  agentId,
  at: now,
  runningRuns: 3,
  queuedRuns: 1,
  openTasks: 2,
  cap,
  model: "claude-opus-x",
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

/** One seat with `left` weekly points, refilling in 20 hours. */
const input = (left: number, millions: readonly number[]): SeatForecastInput => ({
  now,
  seats: [seat],
  readings: [
    { seatId: "seat-a", window: "week", at: now, usedPercent: 100 - left, resetsAt: at(20) },
  ],
  placements: millions.map((_, index) => ({
    agentId: `agent-${index + 1}`,
    seatId: "seat-a",
    from: at(-24),
    to: undefined,
    source: "supervisor" as const,
  })),
  profiles: millions.map((rate, index) => agent(`agent-${index + 1}`, rate)),
  calibrations: [weekFit],
  modelWindows: {},
});

const activities = [activity("agent-1", 3), activity("agent-2", 3)];

verifies("paperclip.seats-cap-advice", () => {
  test("the next big refill is the first weekly reset giving back enough points", () => {
    const refills = [
      { seatId: "seat-a", window: "session" as const, at: at(1), points: 90 },
      { seatId: "seat-a", window: "week" as const, at: at(2), points: 20 },
      { seatId: "seat-b", window: "week" as const, at: at(3), points: 70 },
    ];
    expect(nextBigRefill(refills, { bigRefillPoints: 50, lowestCap: 1 })?.at).toBe(at(3));
  });

  test("no advice when the pool lasts until the next big refill", () => {
    expect(adviseCaps(input(90, [1, 1]), activities)).toBeUndefined();
  });

  test("cuts spread over the heavy agents, heaviest first, until the pool lasts", () => {
    const advice = adviseCaps(input(65, [1.2, 1]), activities);
    expect(advice?.refillAt).toBe(at(20));
    expect(advice?.capDelta).toEqual({ "agent-1": -1, "agent-2": -1 });
    expect(advice?.enough).toBe(true);
    expect(Date.parse(advice?.runOutBefore ?? "")).toBeLessThan(Date.parse(at(20)));
    expect(adviseCaps(input(75, [1.2, 1]), activities)?.capDelta).toEqual({ "agent-1": -1 });
  });

  test("a cut that costs the agent nothing, or goes below the lowest cap, is never proposed", () => {
    const advice = adviseCaps(input(65, [1.2, 1]), [activity("agent-1", undefined)], {
      bigRefillPoints: 50,
      lowestCap: 1,
    });
    expect(advice?.capDelta).toEqual({});
    expect(advice?.enough).toBe(false);
    const floored = adviseCaps(input(65, [1.2, 1]), activities, {
      bigRefillPoints: 50,
      lowestCap: 3,
    });
    expect(floored?.capDelta).toEqual({});
  });
});
