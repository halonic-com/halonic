import type { Coordination, ScheduledTimer, Scheduler, SchedulerListener } from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { secretsWith } from "./agent/turn-test-kit.test-helper.ts";
import { assembleEngine, type EngineAssemblyOptions } from "./engine-assembly.ts";
import {
  harnessPorts,
  NotingScheduler,
  stillOpen,
} from "./harness/harness-test-kit.test-helper.ts";
import {
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  writerAgent,
} from "./kernel/kernel-test-kit.test-helper.ts";
import { replyStart, typesOf } from "./run/local-runs-test-kit.test-helper.ts";

/** A scheduler that remembers its listener and what happened to it. */
class StubScheduler implements Scheduler {
  readonly listener: SchedulerListener;
  readonly #steps: string[];

  constructor(listener: SchedulerListener, steps: string[]) {
    this.listener = listener;
    this.#steps = steps;
  }

  async schedule(): Promise<void> {}
  async cancel(): Promise<void> {}
  async pending(): Promise<ScheduledTimer[]> {
    return [];
  }

  async close(): Promise<void> {
    this.#steps.push("scheduler");
  }
}

const timer: ScheduledTimer = { key: "r-1", timerId: "call:call-1", at: "" };
const noCoordination = {} as Coordination;

function setUp(extra: Partial<EngineAssemblyOptions> = {}) {
  const steps: string[] = [];
  let scheduler: StubScheduler | undefined;
  const options: EngineAssemblyOptions = {
    createScheduler: (listener) => {
      scheduler = new StubScheduler(listener, steps);
      return scheduler;
    },
    executor: {
      resolveModel: async () => {
        throw new Error("No model is used here.");
      },
      halonicTools: [],
      connectors: [],
      secrets: secretsWith(),
      clock: { now: () => new Date("2026-11-03T08:00:00Z") },
      runs: {
        store: new KernelRuns(),
        blobs: new KernelBlobs(),
        ids: fixedIds(),
        definitionsOf: async () => ({ workflow: replyWorkflow }),
      },
    },
    coordination: noCoordination,
    release: async () => {
      steps.push("release");
    },
    ...extra,
  };
  const engine = assembleEngine(options);
  return { engine, steps, listener: () => scheduler?.listener };
}

verifies("engine.engine-assembly", () => {
  it("closes the routines, the scheduler, the closers in order, then releases the lock", async () => {
    const closer = (name: string) => async () => {
      steps.push(name);
    };
    const { engine, steps } = setUp({
      routines: () => ({
        onTick: async () => {},
        dispose: async () => {
          steps.push("routines");
        },
      }),
      closers: [closer("connectors"), closer("copies")],
    });

    const closeExecutor = engine.executor.close.bind(engine.executor);
    engine.executor.close = async () => {
      steps.push("executor");
      await closeExecutor();
    };

    await engine.close();
    await engine.close();

    expect(steps).toEqual(["routines", "executor", "scheduler", "connectors", "copies", "release"]);
  });

  it("runs every closer and releases the lock when one fails, then throws the first failure", async () => {
    const ran: string[] = [];
    const { engine, steps } = setUp({
      closers: [
        async () => {
          throw new Error("first");
        },
        async () => {
          ran.push("second");
          throw new Error("second");
        },
      ],
    });

    await expect(engine.close()).rejects.toThrow("first");

    expect(ran).toEqual(["second"]);
    expect(steps).toEqual(["scheduler", "release"]);
  });

  it("throws the executor's failure, not a later closer's, and still runs the rest", async () => {
    const { engine, steps } = setUp({
      closers: [
        async () => {
          throw new Error("closer");
        },
      ],
    });
    engine.executor.close = async () => {
      throw new Error("executor");
    };

    await expect(engine.close()).rejects.toThrow("executor");

    expect(steps).toEqual(["scheduler", "release"]);
  });

  it("hands the routines the engine's own parts, and a tick to them", async () => {
    const ticks: string[] = [];
    let seen: unknown;
    const { engine, listener } = setUp({
      routines: (parts) => {
        seen = parts;
        return { onTick: async (at) => void ticks.push(at), dispose: async () => {} };
      },
    });

    await listener()?.onTick("2026-11-03T08:00:20Z");

    expect(ticks).toEqual(["2026-11-03T08:00:20Z"]);
    expect(seen).toMatchObject({
      executor: engine.executor,
      runs: engine.runs,
      clock: engine.clock,
      coordination: noCoordination,
    });
  });

  describe("timers", () => {
    it("fails a timer the host holds without reaching the executor", async () => {
      const done: ScheduledTimer[] = [];
      const { listener } = setUp({ holdsTimer: () => true, onTimerDone: (t) => done.push(t) });

      await expect(listener()?.onTimer(timer)).rejects.toThrow("waits for the next engine");

      expect(done).toEqual([]);
    });

    it("fails a timer that arrives before the executor is built", async () => {
      const early: Promise<void>[] = [];
      setUp({
        createScheduler: (listener) => {
          early.push(listener.onTimer(timer));
          return new StubScheduler(listener, []);
        },
      });

      await expect(early[0]).rejects.toThrow("still starting");
    });
  });

  it("releases the lock at once on abandon", async () => {
    const { engine, steps } = setUp();

    await engine.abandon();

    expect(steps).toEqual(["release"]);
  });
});

verifies("engine.harness-stops-with-engine", () => {
  it("stops a harness run going on when the host closes the engine, before the scheduler closes", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const order: string[] = [];
    const runs = new KernelRuns();
    class NotingEngineScheduler extends NotingScheduler {
      readonly listener: SchedulerListener;
      constructor(listener: SchedulerListener) {
        super();
        this.listener = listener;
      }
      async close(): Promise<void> {
        // What the harness had left open when the scheduler began to close.
        order.push(`scheduler (${stillOpen(ports.steps)} open)`);
      }
    }
    let scheduler: NotingEngineScheduler | undefined;
    const engine = assembleEngine({
      createScheduler: (listener) => {
        scheduler = new NotingEngineScheduler(listener);
        return scheduler;
      },
      executor: {
        resolveModel: async () => {
          throw new Error("No model is used here.");
        },
        halonicTools: [],
        connectors: [],
        secrets: secretsWith(),
        clock: { now: () => new Date("2026-11-03T08:00:00Z") },
        runs: {
          store: runs,
          blobs: new KernelBlobs(),
          ids: fixedIds(),
          harnesses: ports.options,
          definitionsOf: async () => ({
            workflow: replyWorkflow,
            agents: { writer: writerAgent("claude-code") },
          }),
        },
      },
      coordination: noCoordination,
      release: async () => {
        order.push("release");
      },
    });

    await engine.executor.start(replyStart);
    const timer = await scheduler?.waitFor("run_1", "harness:call-1");
    const delivery = scheduler?.listener.onTimer({ ...(timer as ScheduledTimer) });
    await waitUntil(`ports.steps to contain "harness.start"`, () =>
      ports.steps.includes("harness.start"),
    );
    expect(ports.steps).toContain("harness.start");
    await engine.close();
    await delivery;

    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(stillOpen(ports.steps)).toBe(0);
    expect(order).toEqual(["scheduler (0 open)", "release"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "running" });
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("harness.started");
  });
});
