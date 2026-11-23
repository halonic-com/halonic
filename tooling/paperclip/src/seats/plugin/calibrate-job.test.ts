import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Calibration } from "../forecast/calibrate.ts";
import type { AgentUsage, SeatReading } from "../records.ts";
import { type CalibrateJobDeps, runSeatsCalibrate } from "./calibrate-job.ts";
import type { ReadJobApi } from "./read-job.ts";

// Made-up company, seat, folder, connection and agents only.
const settings = {
  seats: [{ id: "seat-a", role: "pool", configDir: "/srv/seats/a", connectionId: "conn-a" }],
};
const startMs = Date.parse("2026-11-21T18:00:00.000Z");
const steps = 30;
const minuteMs = 60_000;

/** `seat-a`'s week window, read one minute into each 10-minute bucket, 1 point higher each time. */
function reading(step: number): SeatReading {
  return {
    seatId: "seat-a",
    at: new Date(startMs + (step * 10 + 1) * minuteMs).toISOString(),
    error: undefined,
    session: undefined,
    week: { usedPercent: 20 + step, resetsAt: "2026-11-26T08:00:00.000Z" },
    weekByModel: {},
  };
}

/** `agent-1`'s tokens in the bucket of `step`, on `seat-a`. */
function usage(step: number, agentId = "agent-1"): AgentUsage {
  return {
    agentId,
    seatId: "seat-a",
    model: "claude-made-up",
    bucketStart: new Date(startMs + step * 10 * minuteMs).toISOString(),
    inputTokens: 1_000_000,
    cachedInputTokens: 10_000_000,
    outputTokens: 250_000 + step * 1_000,
    runs: 1,
  };
}

function setup(options: { settings?: Record<string, unknown>; extraUsage?: AgentUsage[] } = {}) {
  const logs: string[] = [];
  const saved: Calibration[] = [];
  const removedBefore: string[] = [];
  const reads = { readings: 0 };
  const ctx: ReadJobApi = {
    companies: { list: async () => [{ id: "acme" } as never] },
    config: { get: async () => options.settings ?? settings },
    logger: { info: (message) => void logs.push(message), error: () => undefined },
  };
  const ordinal = Array.from({ length: steps }, (_, step) => step);
  const deps: CalibrateJobDeps = {
    readings: {
      since: async () => {
        reads.readings += 1;
        return ordinal.map(reading);
      },
    },
    history: {
      placementsSince: async () => [
        {
          agentId: "agent-1",
          seatId: "seat-a",
          from: "2026-11-10T00:00:00.000Z",
          to: undefined,
          source: "observed",
        },
      ],
    },
    forecast: {
      usageSince: async () => [
        ...ordinal.slice(0, -1).map((step) => usage(step)),
        ...(options.extraUsage ?? []),
      ],
      calibrationsSince: async () => [],
      saveCalibrations: async (fits) => void saved.push(...fits),
      removeCalibrationsBefore: async (day) => void removedBefore.push(day),
    },
    store: { manualResets: async () => [] },
    now: () => new Date(startMs + steps * 10 * minuteMs),
  };
  return { ctx, deps, logs, saved, removedBefore, reads };
}

verifies("paperclip.seats-calibrate-job", () => {
  test("stores the fits of the last 7 days and drops fits older than 30 days", async () => {
    const { ctx, deps, logs, saved, removedBefore } = setup();

    await runSeatsCalibrate(ctx, deps);

    expect(saved.map((fit) => [fit.plan, fit.model, fit.window, fit.day])).toEqual([
      ["unknown", "claude-made-up", "week", "2026-11-21"],
    ]);
    expect(saved[0]?.quality.steps).toBe(steps - 1);
    expect(removedBefore).toEqual(["2026-10-22"]);
    expect(logs).toEqual([
      "seats.calibrate: 1 fits stored (0 moved more than 25% in a week), 0 without enough steps, 0 steps skipped because their tokens were on no seat.",
    ]);
  });

  test("logs the steps skipped because their tokens were on no seat", async () => {
    const lost = { ...usage(3, "agent-9"), seatId: undefined };
    const { ctx, deps, logs, saved } = setup({ extraUsage: [lost] });

    await runSeatsCalibrate(ctx, deps);

    expect(saved[0]?.quality.steps).toBe(steps - 2);
    expect(logs[0]).toContain("1 steps skipped because their tokens were on no seat.");
    expect(logs.join("\n")).not.toMatch(/\/srv\/|conn-|agent-/);
  });

  test("reads and stores nothing when no company lists seats", async () => {
    const { ctx, deps, saved, reads } = setup({ settings: { seats: [] } });

    await runSeatsCalibrate(ctx, deps);

    expect(reads.readings).toBe(0);
    expect(saved).toEqual([]);
  });
});
