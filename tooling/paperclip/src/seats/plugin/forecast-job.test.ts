import { verifies } from "@halonicjs/testing-spec";
import type { ScopeKey } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import type { StoredForecastPoint } from "../forecast/accuracy.ts";
import type { Calibration } from "../forecast/calibrate.ts";
import type { ForecastRun } from "../forecast/scenarios.ts";
import type { WindowKey } from "../forecast/types.ts";
import type { AgentUsage } from "../records.ts";
import { type ForecastJobApi, type ForecastJobDeps, runSeatsForecast } from "./forecast-job.ts";

// Made-up company, seat, folder, connection, agent and model only.
const settings = {
  seats: [{ id: "seat-a", role: "pool", configDir: "/srv/seats/a", connectionId: "conn-a" }],
  scenarios: [{ id: "leaner", label: "Leaner prompts", demandFactor: 0.5 }],
};
const now = new Date("2026-11-23T12:00:00.000Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

/** `agent-1`'s tokens in each 10-minute bucket of the last 2 hours. */
const usage: AgentUsage[] = Array.from({ length: 12 }, (_, index) => ({
  agentId: "agent-1",
  seatId: "seat-a",
  model: "claude-made-up",
  bucketStart: at(-120 + index * 10),
  inputTokens: 100_000,
  cachedInputTokens: 800_000,
  outputTokens: 100_000,
  runs: 1,
}));

function calibration(window: WindowKey, pointsPerMillion: number): Calibration {
  return {
    day: "2026-11-23",
    plan: "unknown",
    model: "claude-made-up",
    window,
    from: at(-7 * 24 * 60),
    to: at(-20),
    pointsPerMillion: {
      input: pointsPerMillion,
      cached: pointsPerMillion,
      output: pointsPerMillion,
    },
    quality: { steps: 100, medianErrorPoints: 0.5, p90ErrorPoints: 1 },
    weekShift: undefined,
    shifted: false,
  };
}

function setup(options: { settings?: Record<string, unknown>; fits?: Calibration[] } = {}) {
  const logs: string[] = [];
  const points: StoredForecastPoint[] = [];
  const removedBefore: string[] = [];
  const state = new Map<string, unknown>();
  const ctx: ForecastJobApi = {
    companies: { list: async () => [{ id: "acme" } as never] },
    config: { get: async () => options.settings ?? settings },
    logger: { info: (message) => void logs.push(message), error: () => undefined },
    state: { set: async (key: ScopeKey, value) => void state.set(key.stateKey, value) },
  };
  const deps: ForecastJobDeps = {
    readings: {
      since: async () => [
        {
          seatId: "seat-a",
          at: at(-5),
          error: undefined,
          session: { usedPercent: 40, resetsAt: at(180) },
          week: { usedPercent: 50, resetsAt: at(3 * 24 * 60) },
          weekByModel: {},
        },
      ],
    },
    history: {
      placementsSince: async () => [
        { agentId: "agent-1", seatId: "seat-a", from: at(-600), to: undefined, source: "observed" },
      ],
    },
    forecast: {
      usageSince: async () => usage,
      calibrationsSince: async () =>
        options.fits ?? [calibration("session", 2), calibration("week", 0.2)],
      latestActivity: async () => [
        {
          agentId: "agent-1",
          at: at(-2),
          runningRuns: 1,
          queuedRuns: 0,
          openTasks: 2,
          cap: 2,
          model: "claude-made-up",
        },
      ],
      saveForecastPoints: async (saved) => void points.push(...saved),
      removeForecastPointsBefore: async (before) => void removedBefore.push(before),
    },
    store: { manualResets: async () => [] },
    now: () => now,
  };
  return { ctx, deps, logs, points, removedBefore, state };
}

const sessionAtReset = (run: ForecastRun | undefined) =>
  run?.seats.find((seat) => seat.window === "session")?.atResetP50 ?? 0;

verifies("paperclip.seats-forecast-job", () => {
  test("stores today's forecast points and keeps every scenario's run for the page", async () => {
    const { ctx, deps, logs, points, removedBefore, state } = setup();

    await runSeatsForecast(ctx, deps);

    expect(points.map((point) => [point.seatId, point.window, point.horizon])).toEqual([
      ["seat-a", "session", 60],
      ["seat-a", "session", 300],
      ["seat-a", "session", 1440],
      ["seat-a", "week", 60],
      ["seat-a", "week", 300],
      ["seat-a", "week", 1440],
    ]);
    expect(points.every((point) => point.madeAt === now.toISOString())).toBe(true);
    expect(removedBefore).toEqual(["2026-11-16T12:00:00.000Z"]);
    const runs = state.get("latest") as ForecastRun[];
    expect(runs.map((run) => run.scenario)).toEqual(["current", "leaner"]);
    expect(sessionAtReset(runs[0])).toBeGreaterThan(40);
    expect(sessionAtReset(runs[1])).toBeLessThan(sessionAtReset(runs[0]));
    expect(logs).toEqual([
      "seats.forecast: 2 seat windows, 1 scenario, 6 forecast points stored, 0 agents without a fit for a window; pool run-out (P50) none within 14 days.",
    ]);
  });

  test("still forecasts the seats when an agent's model has no fit, and counts the agent", async () => {
    const { ctx, deps, logs, points } = setup({ fits: [] });

    await runSeatsForecast(ctx, deps);

    expect(points).toHaveLength(6);
    expect(logs[0]).toContain("1 agent without a fit for a window");
    expect(logs.join("\n")).not.toMatch(/\/srv\/|conn-|agent-/);
  });

  test("reads and stores nothing when no company lists seats", async () => {
    const { ctx, deps, points, state } = setup({ settings: { seats: [] } });

    await runSeatsForecast(ctx, deps);

    expect(points).toEqual([]);
    expect(state.size).toBe(0);
  });
});
