import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  type Calibration,
  type CalibrationInput,
  calibrate,
  calibrationShifts,
  calibrationSteps,
  pointsFor,
} from "./calibrate.ts";
import { type AgentUsage, type SeatReading, stepMs } from "./types.ts";

const now = "2026-11-22T00:00:00.000Z";
const start = Date.parse(now) - 2 * 86_400_000;
const at = (step: number) => new Date(start + step * stepMs).toISOString();
const weekReset = "2026-11-25T09:00:00.000Z";

/** Made-up seat `seat-a` with `agent-1` on it: each step uses 2 M input, 20 M cached and 0.5 M output tokens. */
function history(steps: number, pointsPerStep: (step: number) => number): CalibrationInput {
  const readings: SeatReading[] = [];
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
      });
      used += pointsPerStep(step);
    }
  }
  return {
    now,
    seats: [{ id: "seat-a", plan: "max-20x" }],
    readings,
    placements: [{ agentId: "agent-1", seatId: "seat-a", from: at(-10), to: undefined }],
    usage,
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
      return step === 6 ? { ...r, at: new Date(Date.parse(r.at) + 3 * stepMs).toISOString() } : r;
    });
    const usage = [...base.usage, { ...base.usage[4], model: "sonnet" } as AgentUsage];
    const placements = [
      ...base.placements,
      { agentId: "agent-2", seatId: "seat-a", from: at(0.5), to: undefined },
    ];
    const steps = calibrationSteps({ ...base, readings, usage, placements });
    // Step 0 holds the move, 1 the drop to 0, 4 two models, 5 a 40-minute gap; 2 and 3 are left.
    expect(steps).toHaveLength(2);
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
        : pointsFor(fit, input.usage[0]?.tokens ?? { input: 0, cached: 0, output: 0 });
    expect(perStep).toBeGreaterThan(0.3);
    expect(perStep).toBeLessThan(0.5);
    expect(fit?.fittedAt).toBe(now);
  });

  test("too few steps give no fit, and say so", () => {
    const run = calibrate(history(5, () => 1));
    expect(run.calibrations).toEqual([]);
    expect(run.tooFewSteps).toEqual([{ plan: "max-20x", model: "opus", window: "week", steps: 5 }]);
  });

  const fitAt = (fittedAt: string, output: number): Calibration => ({
    plan: "max-20x",
    model: "opus",
    window: "week",
    fittedAt,
    pointsPerMillion: { input: 0.1, cached: 0.01, output },
    quality: {
      steps: 100,
      medianAbsError: 0.2,
      rSquared: 0.9,
      mix: { input: 0.1, cached: 0.85, output: 0.05 },
    },
  });

  test("a fit more than 25% off the oldest fit of the week before is flagged", () => {
    const history = [fitAt("2026-11-15T03:00:00.000Z", 2), fitAt("2026-11-18T03:00:00.000Z", 3)];
    const shifts = calibrationShifts([fitAt("2026-11-22T03:00:00.000Z", 3)], history);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.since).toBe("2026-11-15T03:00:00.000Z");
    expect(shifts[0]?.change).toBeCloseTo(0.05 / 0.1185, 3);
  });

  test("a small shift, or no fit to compare with, raises nothing", () => {
    expect(
      calibrationShifts(
        [fitAt("2026-11-22T03:00:00.000Z", 2.2)],
        [fitAt("2026-11-16T03:00:00.000Z", 2)],
      ),
    ).toEqual([]);
    expect(
      calibrationShifts(
        [fitAt("2026-11-22T03:00:00.000Z", 9)],
        [fitAt("2026-11-01T03:00:00.000Z", 2)],
      ),
    ).toEqual([]);
  });
});
