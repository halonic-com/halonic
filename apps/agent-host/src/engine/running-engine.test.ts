import type { RunStore } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  EngineSchedule,
  engineStoppedCause,
  runningEngine,
  type StoppableEngine,
} from "./running-engine.ts";

const token = "a".repeat(43);

/** A local engine whose close the test ends, recording what it was asked. */
function fakeEngine() {
  const steps: string[] = [];
  let endClose: () => void = () => {};
  let failClose: (error: Error) => void = () => {};
  const closed = new Promise<void>((resolve, reject) => {
    endClose = resolve;
    failClose = reject;
  });
  const engine: StoppableEngine = {
    runs: {} as RunStore,
    clock: systemClock,
    close: async () => {
      steps.push("close");
      await closed;
    },
    abandon: async () => {
      steps.push("abandon");
    },
  };
  return { engine, steps, endClose, failClose };
}

/** A grace time the test ends by hand, which records whether it was cancelled. */
function handWait() {
  let elapse: () => void = () => {};
  const signals: AbortSignal[] = [];
  const wait = (_ms: number, cancel: AbortSignal) =>
    new Promise<void>((resolve) => {
      signals.push(cancel);
      elapse = resolve;
    });
  return { wait, elapse: () => elapse(), signals };
}

function engineWith(
  local: ReturnType<typeof fakeEngine>,
  wait: (ms: number, cancel: AbortSignal) => Promise<void>,
) {
  const ended: unknown[] = [];
  const reported: unknown[] = [];
  let abandoned = 0;
  const running = runningEngine({
    url: "http://127.0.0.1:49152",
    token,
    engine: local.engine,
    schedule: new EngineSchedule(),
    listener: {
      close: async () => {
        local.steps.push("listener");
      },
    },
    wait,
    reportError: (error) => reported.push(error),
    onAbandoned: () => {
      abandoned += 1;
    },
    endStoppedRuns: async (_store, _clock, cause) => {
      ended.push(cause);
      return 2;
    },
  });
  return { running, ended, reported, abandoned: () => abandoned };
}

verifies("agent-host.engine-role-lifecycle", () => {
  describe("runningEngine", () => {
    it("closes the engine within the grace time, then records the runs left as interrupted", async () => {
      const local = fakeEngine();
      const grace = handWait();
      const engine = engineWith(local, grace.wait);
      const { running, ended } = engine;
      const settled = running.settle(10_000);
      local.endClose();
      expect(await settled).toBe(2);
      expect(ended).toEqual([engineStoppedCause]);
      // The grace timer is cleared, so nothing keeps the process alive after `stopped`.
      expect(grace.signals.map((signal) => signal.aborted)).toEqual([true]);
      expect(engine.abandoned()).toBe(0);
      await running.close();
      expect(local.steps).toEqual(["close", "listener", "close"]);
    });

    it("gives the lock up when the steps outlast the grace time, and doesn't wait on them again", async () => {
      const local = fakeEngine();
      const grace = handWait();
      const engine = engineWith(local, grace.wait);
      const { running, ended } = engine;
      const settled = running.settle(10_000);
      grace.elapse();
      expect(await settled).toBe(2);
      expect(ended).toEqual([engineStoppedCause]);
      // The caller ends the process, and with it the step that still runs.
      expect(engine.abandoned()).toBe(1);
      await running.close();
      expect(local.steps).toEqual(["close", "abandon", "listener"]);
    });

    it("reports a close that fails after the grace time", async () => {
      const local = fakeEngine();
      const grace = handWait();
      const engine = engineWith(local, grace.wait);
      const settled = engine.running.settle(10_000);
      grace.elapse();
      await settled;
      const failure = new Error("the step's model call failed");
      local.failClose(failure);
      await new Promise((resolve) => setImmediate(resolve));
      expect(engine.reported).toEqual([failure]);
    });

    it("throws a close that fails within the grace time, and reports nothing", async () => {
      const local = fakeEngine();
      const engine = engineWith(local, handWait().wait);
      const settled = engine.running.settle(10_000);
      local.failClose(new Error("closing failed"));
      await expect(settled).rejects.toThrow("closing failed");
      expect(engine.reported).toEqual([]);
    });
  });

  describe("EngineSchedule", () => {
    it("ticks until it stops, and reports each change", async () => {
      const { schedule, ticks, heard, changes } = scheduleWithFakes();
      schedule.pause(false);
      await ticks.onTick("2026-11-23T08:00:00Z");
      expect(schedule.health()).toEqual({
        scheduling: true,
        paused: false,
        activeRuns: 3,
        runsWaiting: 1,
        lastTick: "2026-11-23T08:00:00Z",
        nextRoutineAt: "2026-11-23T14:00:00.000Z",
      });
      schedule.stop();
      await ticks.onTick("2026-11-23T08:01:00Z");
      expect(heard).toEqual(["tick"]);
      expect(schedule.health().scheduling).toBe(false);
      expect(changes()).toBe(3);
    });
  });
});

/**
 * An `EngineSchedule` over a scheduler that records its calls, with 3 runs
 * going, 1 of them waiting, and a routine due at 14:00.
 */
function scheduleWithFakes() {
  const schedule = new EngineSchedule();
  const heard: string[] = [];
  let changes = 0;
  schedule.follow(() => {
    changes += 1;
  });
  const ticks = schedule.ticks(
    {
      tick: async () => heard.push("tick"),
      pass: async () => heard.push("pass"),
      dispose: async () => {},
    },
    {
      countRuns: async () => ({ active: 3, waiting: 1 }),
      nextRoutineAt: async () => "2026-11-23T14:00:00.000Z",
    },
  );
  return { schedule, ticks, heard, changes: () => changes };
}

verifies("agent-host.engine-routine-pause", () => {
  it("ticks nothing and says paused before the shell's first pause_routines", async () => {
    const { schedule, ticks, heard } = scheduleWithFakes();
    await ticks.onTick("2026-11-23T08:00:00Z");
    expect(heard).toEqual([]);
    expect(schedule.health()).toMatchObject({ paused: true, lastTick: null });
  });

  it("passes ticks while paused, and ticks again from the resume on", async () => {
    const { schedule, ticks, heard, changes } = scheduleWithFakes();
    schedule.pause(true);
    await ticks.onTick("2026-11-23T08:00:00Z");
    await ticks.onTick("2026-11-23T08:01:00Z");
    expect(schedule.health()).toMatchObject({ paused: true, lastTick: null });
    schedule.pause(false);
    expect(schedule.health().paused).toBe(false);
    await ticks.onTick("2026-11-23T08:02:00Z");
    expect(heard).toEqual(["pass", "pass", "tick"]);
    expect(schedule.health().lastTick).toBe("2026-11-23T08:02:00Z");
    // Paused from the start, so the first pause changed nothing: the first
    // pass counted the runs, then the resume and the tick changed it.
    expect(changes()).toBe(3);
  });

  it("does nothing on a tick after the stop, paused or not", async () => {
    const { schedule, ticks, heard } = scheduleWithFakes();
    schedule.pause(true);
    schedule.stop();
    await ticks.onTick("2026-11-23T08:00:00Z");
    expect(heard).toEqual([]);
  });

  it("hands each pause from the running engine to its schedule", () => {
    const schedule = new EngineSchedule();
    const running = runningEngine({
      url: "http://127.0.0.1:49152",
      token,
      engine: fakeEngine().engine,
      schedule,
      listener: { close: async () => {} },
      wait: handWait().wait,
      reportError: () => {},
      onAbandoned: () => {},
      endStoppedRuns: async () => 0,
    });
    running.pauseRoutines(false);
    expect(running.health().paused).toBe(false);
    running.pauseRoutines(true);
    expect(running.health().paused).toBe(true);
  });
});

verifies("agent-host.engine-health-next-routine", () => {
  it("reads the next routine after a tick, and forgets it while paused or stopping", async () => {
    const { schedule, ticks } = scheduleWithFakes();
    schedule.pause(false);
    await ticks.onTick("2026-11-23T09:00:00Z");
    expect(schedule.health()).toMatchObject({
      activeRuns: 3,
      runsWaiting: 1,
      nextRoutineAt: "2026-11-23T14:00:00.000Z",
    });
    schedule.pause(true);
    expect(schedule.health().nextRoutineAt).toBe(null);
    schedule.pause(false);
    // Only the next tick reads it again: the one read before the pause may have passed.
    expect(schedule.health().nextRoutineAt).toBe(null);
    await ticks.onTick("2026-11-23T09:01:00Z");
    expect(schedule.health().nextRoutineAt).toBe("2026-11-23T14:00:00.000Z");
    schedule.stop();
    expect(schedule.health().nextRoutineAt).toBe(null);
  });

  it("counts the runs on a paused tick, without reading the next routine", async () => {
    const { schedule, ticks, heard } = scheduleWithFakes();
    schedule.pause(true);
    await ticks.onTick("2026-11-23T09:00:00Z");
    expect(heard).toEqual(["pass"]);
    expect(schedule.health()).toMatchObject({
      activeRuns: 3,
      runsWaiting: 1,
      nextRoutineAt: null,
    });
  });

  it("reports a tick only when it changed the health", async () => {
    const { schedule, ticks, changes } = scheduleWithFakes();
    schedule.pause(true);
    await ticks.onTick("2026-11-23T09:00:00Z");
    await ticks.onTick("2026-11-23T09:01:00Z");
    expect(changes()).toBe(1);
  });
});
