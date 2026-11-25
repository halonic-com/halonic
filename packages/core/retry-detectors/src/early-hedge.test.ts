import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { calibratedOn } from "./coefficients.ts";
import { type HedgeAttempt, type HedgeDecision, runEarlyHedge } from "./early-hedge.ts";
import { defaultEarlyHedgeConfig, earlyHedgeConfig, hedgeApplies } from "./early-hedge-config.ts";
import type { FinishedAttempt } from "./end-of-run.ts";
import type { CheckpointMinute } from "./in-run.ts";

const minute = 60_000;
const pilot = earlyHedgeConfig({ enabled: true });

/** How one fake attempt goes: its in-run scores, and when it ends with which end-of-run score. */
interface Script {
  readonly inRun?: Partial<Record<CheckpointMinute, number>>;
  readonly endsAtMinute?: number;
  readonly endScore?: number;
  readonly fails?: boolean;
  /** The end-of-run scorer throws on this attempt. */
  readonly scorerThrows?: boolean;
  /** The in-run scorer throws at this checkpoint. */
  readonly inRunThrowsAt?: CheckpointMinute;
}

/** A clock the test moves by hand, with the sleeps the policy is waiting on. */
class FakeClock {
  nowMs = 0;
  readonly #sleepers: { at: number; wake: () => void }[] = [];

  sleep = (ms: number) => {
    let wake: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      wake = resolve;
    });
    const sleeper = { at: this.nowMs + ms, wake };
    this.#sleepers.push(sleeper);
    return { done, cancel: () => sleeper.wake() };
  };

  /** Moves the clock to `toMs` and wakes every sleeper due by then. */
  async advanceTo(toMs: number): Promise<void> {
    this.nowMs = toMs;
    for (const sleeper of this.#sleepers.filter((each) => each.at <= toMs)) sleeper.wake();
    await settle();
  }
}

async function settle(): Promise<void> {
  for (let round = 0; round < 50; round += 1) await Promise.resolve();
}

/** Runs the policy over scripted attempts and returns what it shipped. */
async function hedge(scripts: readonly Script[], config = pilot) {
  const { settled, ...seen } = await runScripted(scripts, config);
  if (settled.status === "rejected") throw settled.reason;
  return { outcome: settled.value, ...seen };
}

/** Runs the policy over scripted attempts, moving the clock a minute at a time. */
async function runScripted(scripts: readonly Script[], config = pilot) {
  const clock = new FakeClock();
  const decisions: HedgeDecision[] = [];
  const stopped: number[] = [];
  const endings: (() => void)[] = [];
  const startedAt: number[] = [];
  const start = (number: number): HedgeAttempt => {
    const script = scripts[number - 1] ?? {};
    startedAt.push(clock.nowMs);
    let finish: (attempt: FinishedAttempt) => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const finished = new Promise<FinishedAttempt>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const endAt = clock.nowMs + (script.endsAtMinute ?? 20) * minute;
    endings.push(() => {
      if (clock.nowMs < endAt) return;
      if (script.fails) fail(new Error("The acme writer crashed."));
      else finish(finishedAs(number));
    });
    return {
      steps: () => [{ t: 0, step: number, tool: "(step)" }],
      finished,
      stop: async () => {
        stopped.push(number);
        fail(new Error("Stopped."));
      },
    };
  };
  const running = runEarlyHedge({
    config,
    setup: calibratedOn,
    start,
    log: (decision) => decisions.push(decision),
    now: () => clock.nowMs,
    sleep: clock.sleep,
    scoreRunning: (steps, at) => {
      const script = scripts[(steps[0]?.step ?? 1) - 1];
      if (script?.inRunThrowsAt === at) throw new Error("The in-run scorer broke.");
      return scored(script?.inRun?.[at] ?? 0.1);
    },
    scoreFinished: (attempt) => {
      const script = scripts[attempt.promptChars - 1];
      if (script?.scorerThrows) throw new Error("The end-of-run scorer broke.");
      return scored(script?.endScore ?? 0.1);
    },
  });
  let ended = false;
  void running.then(
    () => {
      ended = true;
    },
    () => {
      ended = true;
    },
  );
  for (let at = 0; !ended && at <= 60; at += 1) {
    await clock.advanceTo(at * minute);
    for (const end of endings) end();
    await settle();
  }
  const [settled] = await Promise.allSettled([running]);
  return { settled, decisions, stopped, startedAt };
}

function finishedAs(number: number): FinishedAttempt {
  return {
    steps: [],
    setup: calibratedOn,
    diff: "",
    seconds: 1,
    exitCode: 0,
    timedOut: false,
    promptChars: number,
  };
}

function scored(pFail: number) {
  return { kind: "scored" as const, pFail, flagged: pFail > 0.5 };
}

verifies("retry-detectors.early-hedge", () => {
  describe("earlyHedgeConfig", () => {
    it("is off by default, spawns above 0.5, stops above 0.85 and starts at most 3", () => {
      expect(earlyHedgeConfig()).toEqual({
        enabled: false,
        spawnAbove: 0.5,
        stopAbove: 0.85,
        maxAttempts: 3,
      });
      expect(defaultEarlyHedgeConfig.enabled).toBe(false);
    });

    it("refuses thresholds outside 0 to 1, a stop below the spawn, and more than 3 attempts", () => {
      expect(() => earlyHedgeConfig({ spawnAbove: 1.2 })).toThrow(RangeError);
      expect(() => earlyHedgeConfig({ spawnAbove: 0.7, stopAbove: 0.6 })).toThrow(RangeError);
      expect(() => earlyHedgeConfig({ maxAttempts: 4 })).toThrow(RangeError);
    });
  });

  describe("hedgeApplies", () => {
    it("applies only with the flag on and on the calibrated setup", () => {
      expect(hedgeApplies(earlyHedgeConfig(), calibratedOn)).toBe(false);
      expect(hedgeApplies(pilot, calibratedOn)).toBe(true);
      expect(hedgeApplies(pilot, { ...calibratedOn, model: "claude-opus-5-5" })).toBe(false);
    });
  });

  describe("runEarlyHedge", () => {
    it("runs one attempt and ships it when no score passes the spawn threshold", async () => {
      const result = await hedge([{ endsAtMinute: 8 }]);
      expect(result.outcome).toEqual({ kind: "ship", attempt: 1, pFail: 0.1 });
      expect(result.startedAt).toEqual([0]);
    });

    it("starts the next attempt next to one whose in-run score passes 0.5, and ships the best", async () => {
      const result = await hedge([
        { inRun: { 3: 0.6 }, endsAtMinute: 12, endScore: 0.4 },
        { endsAtMinute: 9, endScore: 0.2 },
      ]);
      expect(result.startedAt).toEqual([0, 3 * minute]);
      expect(result.stopped).toEqual([]);
      expect(result.outcome).toEqual({ kind: "ship", attempt: 2, pFail: 0.2 });
    });

    it("stops an attempt only when its score passes 0.85, and never ships it", async () => {
      const result = await hedge([
        { inRun: { 3: 0.6, 6: 0.9 }, endsAtMinute: 7, endScore: 0.01 },
        { endsAtMinute: 9, endScore: 0.3 },
      ]);
      expect(result.stopped).toEqual([1]);
      expect(result.outcome).toEqual({ kind: "ship", attempt: 2, pFail: 0.3 });
    });

    it("starts at most 3 attempts and falls back to Opus when all are flagged", async () => {
      const bad: Script = { inRun: { 3: 0.7 }, endsAtMinute: 5, endScore: 0.8 };
      const result = await hedge([bad, bad, bad, bad]);
      expect(result.startedAt).toHaveLength(3);
      expect(result.outcome).toEqual({ kind: "fallback", attempts: 3 });
    });

    it("hedges an attempt that ends flagged or fails before its first checkpoint", async () => {
      const result = await hedge([
        { endsAtMinute: 1, endScore: 0.9 },
        { endsAtMinute: 1, fails: true },
        { endsAtMinute: 2, endScore: 0.2 },
      ]);
      expect(result.startedAt).toEqual([0, minute, 2 * minute]);
      expect(result.outcome).toEqual({ kind: "ship", attempt: 3, pFail: 0.2 });
    });

    it("logs each start, checkpoint, stop, end and the outcome", async () => {
      const result = await hedge([
        { inRun: { 3: 0.9 }, endsAtMinute: 20 },
        { endsAtMinute: 4, endScore: 0.2 },
      ]);
      expect(result.decisions.map((decision) => `${decision.kind}`)).toEqual([
        "started",
        "checkpoint",
        "started",
        "stopped",
        "checkpoint",
        "finished",
        "ship",
      ]);
      expect(result.decisions.slice(0, 4)).toMatchObject([
        { kind: "started", attempt: 1, reason: "first" },
        { kind: "checkpoint", attempt: 1, minute: 3, pFail: 0.9, spawned: true, stopped: true },
        { kind: "started", attempt: 2, reason: "spawn", spawnedBy: 1 },
        { kind: "stopped", attempt: 1, reason: "score" },
      ]);
    });

    it("logs a checkpoint over the spawn threshold as not spawned once the limit is reached", async () => {
      const bad: Script = { inRun: { 3: 0.7, 6: 0.7 }, endsAtMinute: 8, endScore: 0.8 };
      const result = await hedge([bad], earlyHedgeConfig({ enabled: true, maxAttempts: 1 }));
      const checkpoints = result.decisions.filter((decision) => decision.kind === "checkpoint");
      expect(checkpoints.map((each) => each.kind === "checkpoint" && each.spawned)).toEqual([
        false,
        false,
      ]);
    });

    it("counts an attempt whose end-of-run scorer throws as failed, and hedges it", async () => {
      const result = await hedge([
        { endsAtMinute: 1, scorerThrows: true },
        { endsAtMinute: 2, endScore: 0.2 },
      ]);
      expect(result.decisions).toContainEqual(
        expect.objectContaining({
          kind: "failed",
          attempt: 1,
          error: "The end-of-run scorer broke.",
        }),
      );
      expect(result.outcome).toEqual({ kind: "ship", attempt: 2, pFail: 0.2 });
    });

    it("stops every running attempt before passing an error on", async () => {
      const result = await runScripted([
        { inRun: { 3: 0.6 }, inRunThrowsAt: 6 },
        { endsAtMinute: 30 },
      ]);
      expect(result.settled).toMatchObject({
        status: "rejected",
        reason: new Error("The in-run scorer broke."),
      });
      expect(result.stopped.sort()).toEqual([1, 2]);
      expect(result.decisions.filter((decision) => decision.kind === "stopped")).toMatchObject([
        { attempt: 1, reason: "cancelled" },
        { attempt: 2, reason: "cancelled" },
      ]);
    });

    it("refuses a setup the detectors weren't fitted on", async () => {
      await expect(
        runEarlyHedge({
          config: pilot,
          setup: { ...calibratedOn, provider: "acme" },
          start: () => {
            throw new Error("Never started.");
          },
          sleep: () => ({ done: Promise.resolve(), cancel: () => undefined }),
        }),
      ).rejects.toThrow(/runs only on opencode/);
    });
  });
});
