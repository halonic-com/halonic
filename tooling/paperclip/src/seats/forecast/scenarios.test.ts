import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Calibration } from "./calibrate.ts";
import type { DemandProfile } from "./demand.ts";
import { capFactor, forecastRuns, type Scenario, scenarioProfiles } from "./scenarios.ts";
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

/** A made-up agent using one million output tokens every hour, busy hours twice that. */
const agent = (agentId: string): DemandProfile => ({
  agentId,
  model: "claude-opus-x",
  mix: { input: 0, cached: 0, output: 1 },
  idle: false,
  currentRate: 1_000_000,
  weekProfile: new Array<number>(168).fill(1_000_000),
  spread: 2,
});

const activity = (agentId: string, cap: number | undefined, work: number): AgentActivity => ({
  agentId,
  at: now,
  runningRuns: Math.min(work, cap ?? work),
  queuedRuns: Math.max(0, work - (cap ?? work)),
  openTasks: 1,
  cap,
  model: "claude-opus-x",
});

/** Weekly points per million output tokens for one model. */
const weekFit = (model: string, pointsPerMillion: number): Calibration => ({
  plan: "max",
  model,
  window: "week",
  day: "2026-11-22",
  from: at(-168),
  to: at(-1),
  pointsPerMillion: { input: 0, cached: 0, output: pointsPerMillion },
  quality: { steps: 500, medianErrorPoints: 1, p90ErrorPoints: 2 },
  weekShift: undefined,
  shifted: false,
});

const input: SeatForecastInput = {
  now,
  seats: [seat],
  readings: [{ seatId: "seat-a", window: "week", at: now, usedPercent: 10, resetsAt: at(100) }],
  placements: ["agent-1", "agent-2"].map((agentId) => ({
    agentId,
    seatId: "seat-a",
    from: at(-24),
    to: undefined,
    source: "supervisor" as const,
  })),
  profiles: [agent("agent-1"), agent("agent-2")],
  calibrations: [
    weekFit("claude-opus-x", 1),
    { ...weekFit("claude-sonnet-x", 0.25), day: "2026-11-21" },
  ],
  modelWindows: {},
};

const scenario = (fields: Partial<Scenario>): Scenario => ({
  id: "what-if",
  label: "What if",
  capDelta: {},
  modelOverride: {},
  demandFactor: 1,
  ...fields,
});

verifies("paperclip.seats-scenarios", () => {
  test("a cap cut costs only the runs the agent has work for", () => {
    expect(capFactor(activity("agent-1", 3, 4), -1)).toBeCloseTo(2 / 3);
    expect(capFactor(activity("agent-1", 3, 1), -1)).toBe(1);
    expect(capFactor(activity("agent-1", 1, 1), -1)).toBe(0);
    expect(capFactor(activity("agent-1", undefined, 5), -1)).toBe(1);
    expect(capFactor(undefined, -1)).toBe(1);
  });

  test("a scenario changes only the agents it names, plus the shared demand factor", () => {
    const [first, second] = scenarioProfiles(
      input.profiles,
      [activity("agent-1", 2, 4), activity("agent-2", 2, 4)],
      scenario({ capDelta: { "agent-1": -1 }, demandFactor: 0.8 }),
    );
    expect(first?.currentRate).toBeCloseTo(400_000);
    expect(first?.weekProfile[0]).toBeCloseTo(400_000);
    expect(second?.currentRate).toBeCloseTo(800_000);
  });

  test("current comes first, then each scenario in its settings order", () => {
    const runs = forecastRuns(input, [], [scenario({ id: "b" }), scenario({ id: "a" })]);
    expect(runs.map((run) => run.scenario)).toEqual(["current", "b", "a"]);
    expect(runs[0]?.madeAt).toBe(now);
    expect(runs[0]?.calibrationDay).toBe("2026-11-22");
  });

  test("a demand factor scales the points every agent adds", () => {
    const [current, leaner] = forecastRuns(input, [], [scenario({ demandFactor: 0.8 })]);
    expect(current?.pool.pointsPerDayNow.p50).toBeCloseTo(48);
    expect(leaner?.pool.pointsPerDayNow.p50).toBeCloseTo(48 * 0.8);
    expect(leaner?.seats[0]?.usedPercentNow).toBe(10);
  });

  test("a model switch prices the agent at that model's fit, or lists it as uncalibrated", () => {
    const [, sonnet, unknown] = forecastRuns(
      input,
      [],
      [
        scenario({ modelOverride: { "agent-2": "claude-sonnet-x" } }),
        scenario({ id: "unknown", modelOverride: { "agent-2": "claude-haiku-x" } }),
      ],
    );
    expect(sonnet?.pool.pointsPerDayNow.p50).toBeCloseTo(24 + 6);
    expect(unknown?.pool.pointsPerDayNow.p50).toBeCloseTo(24);
    expect(unknown?.uncalibrated).toEqual([
      { plan: "max", model: "claude-haiku-x", window: "week", agentId: "agent-2" },
    ]);
  });
});
