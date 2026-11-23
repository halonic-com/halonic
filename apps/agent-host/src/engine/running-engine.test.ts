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
  const closed = new Promise<void>((resolve) => {
    endClose = resolve;
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
  return { engine, steps, endClose };
}

/** A grace time the test ends by hand. */
function handWait() {
  let elapse: () => void = () => {};
  const wait = () =>
    new Promise<void>((resolve) => {
      elapse = resolve;
    });
  return { wait, elapse: () => elapse() };
}

function engineWith(local: ReturnType<typeof fakeEngine>, wait: (ms: number) => Promise<void>) {
  const ended: unknown[] = [];
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
    endStoppedRuns: async (_store, _clock, cause) => {
      ended.push(cause);
      return 2;
    },
  });
  return { running, ended };
}

verifies("agent-host.engine-role-lifecycle", () => {
  describe("runningEngine", () => {
    it("closes the engine within the grace time, then records the runs left as interrupted", async () => {
      const local = fakeEngine();
      const grace = handWait();
      const { running, ended } = engineWith(local, grace.wait);
      const settled = running.settle(10_000);
      local.endClose();
      expect(await settled).toBe(2);
      expect(ended).toEqual([engineStoppedCause]);
      await running.close();
      expect(local.steps).toEqual(["close", "listener", "close"]);
    });

    it("gives the lock up when the steps outlast the grace time, and doesn't wait on them again", async () => {
      const local = fakeEngine();
      const grace = handWait();
      const { running, ended } = engineWith(local, grace.wait);
      const settled = running.settle(10_000);
      grace.elapse();
      expect(await settled).toBe(2);
      expect(ended).toEqual([engineStoppedCause]);
      await running.close();
      expect(local.steps).toEqual(["close", "abandon", "listener"]);
    });
  });

  describe("EngineSchedule", () => {
    it("ticks until it stops, and reports each change", async () => {
      const schedule = new EngineSchedule();
      const ticked: string[] = [];
      let changes = 0;
      schedule.follow(() => {
        changes += 1;
      });
      const ticks = schedule.ticks(
        {
          tick: async () => ticked.push("tick"),
          dispose: async () => {},
        },
        async () => 3,
      );
      await ticks.onTick("2026-11-23T08:00:00Z");
      expect(schedule.health()).toEqual({
        scheduling: true,
        activeRuns: 3,
        lastTick: "2026-11-23T08:00:00Z",
      });
      schedule.stop();
      await ticks.onTick("2026-11-23T08:01:00Z");
      expect(ticked).toEqual(["tick"]);
      expect(schedule.health().scheduling).toBe(false);
      expect(changes).toBe(2);
    });
  });
});
