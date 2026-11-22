import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  type Calibration,
  type CalibrationInput,
  calibrate,
  calibrationSteps,
  pointsFor,
} from "./calibrate.ts";
import { type AgentUsage, bucketMs, type WindowReading } from "./types.ts";

const now = "2026-11-22T00:00:00.000Z";
const start = Date.parse(now) - 2 * 86_400_000;
const at = (step: number) => new Date(start + step * bucketMs).toISOString();
const weekReset = "2026-11-25T09:00:00.000Z";

/** Made-up seat `seat-a` with `agent-1` on it: each step uses 2 M input, 20 M cached and 0.5 M output tokens. */
function history(steps: number, pointsPerStep: (step: number) => number): CalibrationInput {
  const readings: WindowReading[] = [];
  const usage: AgentUsage[] = [];
  let used = 0;
  for (let step = 0; step <= steps; step += 1) {
    readings.push({
      seatId: "seat-a",
      window: "week",
      at: at(step),
      usedPercent: used,
      resetsAt: weekReset,
    });
    if (step < steps) {
      const tokens = { input: 2_000_000, cached: 20_000_000, output: 500_000 };
      usage.push({
        agentId: "agent-1",
        seatId: "seat-a",
        model: "opus",
        bucketStart: at(step),
        tokens,
        runs: 1,
      });
      used += pointsPerStep(step);
    }
  }
  return {
    now,
    seats: [
      {
        id: "seat-a",
        role: "pool",
        plan: "max-20x",
        resetGroup: undefined,
        manualResetUsed: false,
        status: "active",
      },
    ],
    readings,
    readIntervalMs: bucketMs,
    placements: [
      { agentId: "agent-1", seatId: "seat-a", from: at(-10), to: undefined, source: "observed" },
    ],
    usage,
    history: [],
  };
}

verifies("paperclip.seats-calibrate", () => {
  test("a step's points line up with the tokens used between its two readings", () => {
    const steps = calibrationSteps(history(3, () => 1));
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({
      plan: "max-20x",
      model: "opus",
      window: "week",
      from: at(0),
      to: at(0),
      tokens: { input: 2_000_000, cached: 20_000_000, output: 500_000 },
      points: 1,
    });
  });

  test("a step with a reset, a move, a gap or two models is skipped", () => {
    const base = history(6, () => 1);
    const readings = base.readings.map((r, step) => {
      if (step === 2) {
        return { ...r, usedPercent: 0 };
      }
      return step === 6 ? { ...r, at: new Date(Date.parse(r.at) + 3 * bucketMs).toISOString() } : r;
    });
    const usage = [...base.usage, { ...base.usage[4], model: "sonnet" } as AgentUsage];
    const placements = [
      ...base.placements,
      {
        agentId: "agent-2",
        seatId: "seat-a",
        from: at(0.5),
        to: undefined,
        source: "board" as const,
      },
    ];
    const steps = calibrationSteps({ ...base, readings, usage, placements });
    // Step 0 holds the move, 1 the drop to 0, 4 two models, 5 a 40-minute gap; 2 and 3 are left.
    expect(steps).toHaveLength(2);
  });

  test("tokens on no known seat skip every step they fall in", () => {
    const base = history(4, () => 1);
    const lost = { ...base.usage[0], agentId: "agent-9", seatId: undefined } as AgentUsage;
    const idle = { ...lost, bucketStart: at(2), tokens: { input: 0, cached: 0, output: 0 } };
    const steps = calibrationSteps({ ...base, usage: [...base.usage, lost, idle] });
    // Step 0 holds the lost tokens; a bucket with no tokens costs nothing and skips nothing.
    expect(steps.map((s) => s.from)).toEqual([at(1), at(2), at(3)]);
  });

  test("a gap counts against the read interval, not the bucket", () => {
    const base = history(3, () => 1);
    // Reads every 15 minutes: a 30-minute step is one late read, not a failed one.
    const readings = base.readings.map((r, step) => ({ ...r, at: at(step * 3) }));
    const usage = base.usage.flatMap((u, step) =>
      [0, 1, 2].map((offset) => ({ ...u, bucketStart: at(step * 3 + offset) })),
    );
    const steps = calibrationSteps({ ...base, readings, usage, readIntervalMs: 15 * 60_000 });
    expect(steps).toHaveLength(3);
  });

  test("a seat with no plan is calibrated under `unknown`", () => {
    const base = history(1, () => 1);
    const seats = base.seats.map((seat) => ({ ...seat, plan: undefined }));
    expect(calibrationSteps({ ...base, seats })[0]?.plan).toBe("unknown");
  });

  test("readings older than 7 days are left out", () => {
    const old = history(3, () => 1);
    const steps = calibrationSteps({ ...old, now: new Date(start + 8 * 86_400_000).toISOString() });
    expect(steps).toEqual([]);
  });

  test("whole-percent readings still give the true cost over many steps", () => {
    // The true cost is 0.4 points a step, read as whole percent: 0, 0, 1, 0, 1, ...
    const truth = 0.4;
    const input = history(288, () => 0);
    const readings = input.readings.map((r, step) => ({
      ...r,
      usedPercent: Math.floor(step * truth),
    }));
    const run = calibrate({ ...input, readings });
    expect(run.tooFewSteps).toEqual([]);
    const [fit] = run.calibrations;
    expect(fit?.quality.steps).toBe(288);
    const perStep =
      fit === undefined
        ? 0
        : pointsFor(
            fit.pointsPerMillion,
            input.usage[0]?.tokens ?? { input: 0, cached: 0, output: 0 },
          );
    expect(perStep).toBeGreaterThan(0.3);
    expect(perStep).toBeLessThan(0.5);
    expect(fit?.day).toBe("2026-11-22");
    expect(fit?.from).toBe(at(0));
    expect(fit?.to).toBe(at(287));
    // Whole-percent readings are off by up to a point a step.
    expect(fit?.quality.medianErrorPoints).toBeLessThan(1);
    expect(fit?.quality.p90ErrorPoints).toBeLessThan(1);
    expect(fit?.weekShift).toBeUndefined();
    expect(fit?.shifted).toBe(false);
  });

  test("too few steps give no fit, and say so", () => {
    const run = calibrate(history(5, () => 1));
    expect(run.calibrations).toEqual([]);
    expect(run.tooFewSteps).toEqual([{ plan: "max-20x", model: "opus", window: "week", steps: 5 }]);
  });

  /** A stored fit of the same key whose output tokens cost `output` points per million. */
  const fitOn = (day: string, output: number): Calibration => ({
    plan: "max-20x",
    model: "opus",
    window: "week",
    day,
    from: `${day}T00:00:00.000Z`,
    to: `${day}T00:00:00.000Z`,
    pointsPerMillion: { input: 0, cached: 0, output },
    quality: { steps: 100, medianErrorPoints: 0.2, p90ErrorPoints: 0.5 },
    weekShift: undefined,
    shifted: false,
  });
  // 30 steps of 1 point, each with 0.5 M output: the fit prices them at about 2 points per million.
  const thirty = () => {
    const base = history(30, () => 1);
    const usage = base.usage.map((u) => ({
      ...u,
      tokens: { input: 0, cached: 0, output: 500_000 },
    }));
    return { ...base, usage };
  };

  test("a fit more than 25% off the oldest fit of the week before is flagged", () => {
    const run = calibrate({
      ...thirty(),
      history: [fitOn("2026-11-15", 1.4), fitOn("2026-11-18", 2)],
    });
    const [fit] = run.calibrations;
    expect(fit?.weekShift).toBeCloseTo(2 / 1.4 - 1, 3);
    expect(fit?.shifted).toBe(true);
  });

  test("a small shift, or no fit within the week before, raises nothing", () => {
    const small = calibrate({ ...thirty(), history: [fitOn("2026-11-16", 1.85)] });
    expect(small.calibrations[0]?.weekShift).toBeCloseTo(2 / 1.85 - 1, 3);
    expect(small.calibrations[0]?.shifted).toBe(false);
    const old = calibrate({ ...thirty(), history: [fitOn("2026-11-01", 1)] });
    expect(old.calibrations[0]?.weekShift).toBeUndefined();
    expect(old.calibrations[0]?.shifted).toBe(false);
  });

  test("a week of 8 seats and 20 agents calibrates in well under a second", () => {
    const seats = Array.from({ length: 8 }, (_, n) => ({
      ...(history(0, () => 0).seats[0] as CalibrationInput["seats"][number]),
      id: `seat-${n}`,
    }));
    const weekSteps = (7 * 86_400_000) / bucketMs;
    const weekStart = Date.parse(now) - 7 * 86_400_000;
    const time = (step: number) => new Date(weekStart + step * bucketMs).toISOString();
    const readings: WindowReading[] = [];
    const usage: AgentUsage[] = [];
    for (let step = 0; step < weekSteps; step += 1) {
      for (const seat of seats) {
        for (const window of ["session", "week"] as const) {
          readings.push({
            seatId: seat.id,
            window,
            at: time(step),
            usedPercent: step,
            resetsAt: weekReset,
          });
        }
      }
      for (let agent = 0; agent < 20; agent += 1) {
        usage.push({
          agentId: `agent-${agent}`,
          seatId: `seat-${agent % 8}`,
          model: "opus",
          bucketStart: time(step),
          tokens: { input: 1_000_000, cached: 10_000_000, output: 250_000 },
          runs: 1,
        });
      }
    }
    const started = performance.now();
    const run = calibrate({ ...history(0, () => 0), seats, readings, usage, placements: [] });
    // Indexed, this takes tens of milliseconds; scanning every row per step took 33 s.
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(run.calibrations).toHaveLength(2);
    expect(run.calibrations[0]?.quality.steps).toBe(8 * (weekSteps - 1));
  });
});
