import { verifies } from "@halonicjs/testing-spec";
import type { ScopeKey } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import type { Calibration } from "../forecast/calibrate.ts";
import type { WindowChange } from "../forecast/effects.ts";
import type { WindowKey } from "../forecast/types.ts";
import type { AgentUsage, SeatReading } from "../records.ts";
import type { AgentNow } from "./paperclip-tables.ts";
import {
  capAdviceText,
  type LatestPlan,
  type PlanJobApi,
  type PlanJobDeps,
  runSeatsPlan,
} from "./plan-job.ts";

// Made-up company, seats, folders, connections, agent and model only.
const seatA = {
  id: "seat-a",
  role: "pool",
  configDir: "/srv/seats/a",
  connectionId: "conn-a",
  resetGroup: "group-a",
};
const seatB = { id: "seat-b", role: "pool", configDir: "/srv/seats/b", connectionId: "conn-b" };
const now = new Date("2026-11-23T12:00:00.000Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

const agent: AgentNow = {
  agentId: "agent-1",
  name: "Agent 1",
  configDir: undefined,
  connectionId: "conn-a",
  model: "claude-made-up",
  cap: 2,
  runningRuns: 1,
  queuedRuns: 0,
  openTasks: 2,
};

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
  const perType = { input: pointsPerMillion, cached: pointsPerMillion, output: pointsPerMillion };
  return {
    day: "2026-11-23",
    plan: "unknown",
    model: "claude-made-up",
    window,
    from: at(-7 * 24 * 60),
    to: at(-20),
    pointsPerMillion: perType,
    quality: { steps: 100, medianErrorPoints: 0.5, p90ErrorPoints: 1 },
    weekShift: undefined,
    shifted: false,
  };
}

function reading(seatId: string, weekPercent: number, weekResetDays: number): SeatReading {
  return {
    seatId,
    at: at(-5),
    error: undefined,
    session: { usedPercent: 20, resetsAt: at(180) },
    week: { usedPercent: weekPercent, resetsAt: at(weekResetDays * 24 * 60) },
    weekByModel: {},
  };
}

interface Options {
  readonly seats?: readonly Record<string, unknown>[];
  readonly readings?: SeatReading[];
}

function setup(options: Options = {}) {
  const logs: string[] = [];
  const state = new Map<string, unknown>();
  const reads = { readings: 0 };
  const ctx: PlanJobApi = {
    companies: { list: async () => [{ id: "acme" } as never] },
    config: { get: async () => ({ seats: options.seats ?? [seatA, seatB] }) },
    logger: { info: (message) => void logs.push(message), error: () => undefined },
    state: { set: async (key: ScopeKey, value) => void state.set(key.stateKey, value) },
  };
  const deps: PlanJobDeps = {
    tables: { agentsNow: async () => [agent] },
    readings: {
      since: async () => {
        reads.readings += 1;
        return options.readings ?? [reading("seat-a", 90, 4), reading("seat-b", 10, 2)];
      },
    },
    history: {
      placementsSince: async () => [
        { agentId: "agent-1", seatId: "seat-a", from: at(-600), to: undefined, source: "observed" },
      ],
    },
    forecast: {
      usageSince: async () => usage,
      calibrationsSince: async () => [calibration("session", 2), calibration("week", 0.2)],
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
    },
    store: { manualResets: async () => [] },
    now: () => now,
  };
  const plan = () => state.get("latest") as LatestPlan | undefined;
  return { ctx, deps, logs, plan, reads };
}

const week = (windows: readonly WindowChange[], seatId: string) =>
  windows.find((change) => change.seatId === seatId && change.window === "week");

verifies("paperclip.seats-plan-job", () => {
  test("prices the proposed move and the advised reset, and keeps the plan for the page", async () => {
    const { ctx, deps, logs, plan } = setup();

    await runSeatsPlan(ctx, deps);

    const kept = plan();
    expect(kept?.madeAt).toBe(now.toISOString());
    expect(kept?.moves.map((move) => [move.fromSeatId, move.move.toSeatId, move.reason])).toEqual([
      ["seat-a", "seat-b", "week-full"],
    ]);
    const windows = kept?.moves[0]?.windows ?? [];
    const from = week(windows, "seat-a");
    const to = week(windows, "seat-b");
    expect(from?.after.p50).toBeLessThan(from?.before.p50 ?? 0);
    expect(to?.after.p50).toBeGreaterThan(to?.before.p50 ?? 0);
    expect(kept?.resets.map((reset) => reset.seatId)).toEqual(["seat-a"]);
    expect(kept?.withoutTarget).toEqual([]);
    expect(logs).toEqual([
      "seats.plan: 1 move priced, 0 moves with no seat to go to, 1 reset priced, 0 target seat windows without a reading; cap advice: none.",
    ]);
    expect(logs.join("\n")).not.toMatch(/\/srv\/|conn-|agent-|Agent /);
  });

  test("counts a window the agent uses that its target seat has no reading for", async () => {
    const full = reading("seat-a", 90, 4);
    const withModelWindow: SeatReading = {
      ...full,
      weekByModel: { Made: { usedPercent: 30, resetsAt: at(4 * 24 * 60) } },
    };
    const { ctx, deps, logs } = setup({ readings: [withModelWindow, reading("seat-b", 10, 2)] });

    await runSeatsPlan(ctx, deps);

    expect(logs[0]).toContain("1 target seat window without a reading");
  });

  test("prices no move when no seat can take the agent, but still prices the reset", async () => {
    const { ctx, deps, logs, plan } = setup({
      seats: [seatA],
      readings: [reading("seat-a", 90, 4)],
    });

    await runSeatsPlan(ctx, deps);

    expect(plan()?.moves).toEqual([]);
    expect(plan()?.withoutTarget.map((move) => move.agentId)).toEqual(["agent-1"]);
    expect(plan()?.resets.map((reset) => reset.seatId)).toEqual(["seat-a"]);
    expect(logs[0]).toContain("1 move with no seat to go to, 1 reset priced");
  });

  test("logs the cap advice as counts", () => {
    const advice = {
      refillAt: at(2 * 24 * 60),
      runOutBefore: at(24 * 60),
      capDelta: { "agent-1": -1, "agent-2": -1 },
      runOutAfter: undefined,
      enough: true,
    };

    expect(capAdviceText(advice)).toBe(
      "cut 2 runs for 2 agents, enough to last until the next big refill",
    );
    expect(capAdviceText({ ...advice, capDelta: { "agent-1": -1 }, enough: false })).toBe(
      "cut 1 run for 1 agent, not enough to last until the next big refill",
    );
  });

  test("reads and stores nothing when no company lists seats", async () => {
    const { ctx, deps, plan, reads } = setup({ seats: [] });

    await runSeatsPlan(ctx, deps);

    expect(reads.readings).toBe(0);
    expect(plan()).toBeUndefined();
  });
});
