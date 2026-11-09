import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { EventBus } from "./event-bus.ts";
import { lastTickKey, queueKey, routineRunId, utf8Length } from "./routine-ids.ts";
import { MAX_QUEUED, type RoutineOverlap } from "./routine-overlap.ts";
import {
  type DueFunction,
  RoutineScheduler,
  type RoutineStart,
  type ScheduledRun,
} from "./routine-scheduler.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import type { AppEvents } from "./workspace-scope.ts";

/** A routine for these tests: due at a fixed minute of every hour, or of one hour a day. */
interface TestRoutine {
  key: string;
  minute: number;
  hour?: number;
  agent?: string;
  /** Default "allow", so tests of other rules can start several runs of one routine. */
  overlap?: RoutineOverlap;
}

type Policy = "all" | "last";

/** A due run of a {@link TestRoutine}. */
type TestRun = ScheduledRun & { routine: TestRoutine };

const hourMs = 3_600_000;

/**
 * A stand-in for the tick function of `@halonicjs/routines`: every
 * due time in (lastTick, now], all of them or only the last. Nothing on the
 * first tick.
 */
const testDue: DueFunction<TestRoutine, Policy, TestRun> = (routines, lastTick, now, policy) => {
  if (lastTick === null) {
    return [];
  }
  const runs: TestRun[] = [];
  for (const routine of routines) {
    const times: Date[] = [];
    let at = Math.floor(lastTick.getTime() / hourMs) * hourMs + routine.minute * 60_000;
    for (; at <= now.getTime(); at += hourMs) {
      const hourMatches = routine.hour === undefined || new Date(at).getUTCHours() === routine.hour;
      if (at > lastTick.getTime() && hourMatches) {
        times.push(new Date(at));
      }
    }
    const picked = policy === "all" ? times : times.slice(-1);
    runs.push(
      ...picked.map((time) => ({
        key: routine.key,
        routine,
        at: time,
        trigger: "schedule" as const,
      })),
    );
  }
  return runs;
};

function startOf(run: TestRun): RoutineStart {
  const hubId = run.key.split("/")[0] ?? "";
  if (run.routine.agent !== undefined) {
    return { agent: { hubId, agentId: run.routine.agent, prompt: "Say hi" } };
  }
  return { workflow: { hubId, workflowId: "f", input: { q: `due ${run.at.toISOString()}` } } };
}

interface SetUpOptions {
  policy?: Policy;
  /** Another host of the same workspace. */
  shared?: { coordination: TestCoordination; executor: TestExecutor };
  startOf?: (run: TestRun) => RoutineStart;
  workspaceId?: string;
}

const workspace = "ws-7f3a2c";
const tickKey = lastTickKey(workspace);

function setUp(
  routines: TestRoutine[],
  { policy = "all", shared, startOf: start = startOf, workspaceId = workspace }: SetUpOptions = {},
) {
  let now = Date.parse("2026-11-03T07:00:30Z");
  const coordination = shared?.coordination ?? new TestCoordination();
  const executor = shared?.executor ?? new TestExecutor();
  const events = new EventBus<AppEvents>();
  const ticks: AppEvents["routines.ticked"][] = [];
  events.on("routines.ticked", (tick) => ticks.push(tick));
  const scheduler = new RoutineScheduler<TestRoutine, Policy, TestRun>({
    workspaceId,
    clock: { now: () => new Date(now) },
    coordination,
    executor,
    routines: async () => routines,
    due: testDue,
    policy,
    startOf: start,
    overlapOf: (run) => run.routine.overlap ?? "allow",
    runs: executor,
    events,
  });
  const at = (iso: string) => {
    now = Date.parse(iso);
  };
  return { scheduler, coordination, executor, ticks, at };
}

const ids = (runs: { id: string }[]) => runs.map((run) => run.id);

verifies("app.routine-scheduler", () => {
  it("catches up on missed ticks under the policy, once each", async () => {
    const { scheduler, coordination, executor, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T10:00:30Z");
    const { started } = await scheduler.tick();
    expect(started.map((run) => run.trigger?.at)).toEqual([
      "2026-11-03T08:00:00.000Z",
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
    ]);
    expect(executor.runs.size).toBe(3);
    expect(await coordination.read(tickKey)).toBe("2026-11-03T10:00:30.000Z");
  });

  it("starts only the last missed run under a 'last' policy", async () => {
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0 }], { policy: "last" });
    await scheduler.tick();
    at("2026-11-03T10:00:30Z");
    expect(ids((await scheduler.tick()).started)).toEqual([
      routineRunId(workspace, "p/hourly", new Date("2026-11-03T10:00:00Z")),
    ]);
  });

  // Ported from 784f78d studio.test.ts "runs a scheduled routine when it is due, with a fake clock and timers":
  // the scheduling steps. Input templates, next-run times and the sidebar wait for the routines tick function and feature.
  it("runs a scheduled routine when it is due, and not twice", async () => {
    const { scheduler, executor, at } = setUp([{ key: "p/morning", minute: 0, hour: 8 }]);
    at("2026-11-03T07:59:00Z");
    expect((await scheduler.tick()).started).toEqual([]);
    at("2026-11-03T08:00:20Z");
    const { started } = await scheduler.tick();
    expect(started.map((run) => run.trigger)).toEqual([
      { type: "schedule", routineId: "p/morning", at: "2026-11-03T08:00:00.000Z" },
    ]);
    expect(executor.requests[0]).toMatchObject({ input: { q: "due 2026-11-03T08:00:00.000Z" } });
    at("2026-11-03T08:00:50Z");
    expect((await scheduler.tick()).started).toEqual([]);
  });

  it("starts nothing for a repeated tick or a late one with an earlier clock", async () => {
    const { scheduler, executor, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    await scheduler.onTick("2026-11-03T08:00:00Z");
    at("2026-11-03T08:00:10Z");
    await scheduler.onTick("2026-11-03T08:00:00Z");
    expect(executor.requests.length).toBe(1);
  });

  it("repeats starts with the same run ids when the last tick was not stored", async () => {
    const { scheduler, coordination, executor, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    const before = await coordination.read(tickKey);
    at("2026-11-03T08:00:20Z");
    const first = await scheduler.tick();
    await coordination.compareAndSet(tickKey, "2026-11-03T08:00:20.000Z", before);
    executor.end(ids(first.started)[0] ?? "");
    const again = await scheduler.tick();
    expect(ids(again.started)).toEqual(ids(first.started));
    expect([executor.requests.length, executor.runs.size]).toEqual([2, 1]);
  });

  it("asks for a run again only once it has ended, when the last tick was not stored", async () => {
    const { scheduler, coordination, executor, at } = setUp([
      { key: "p/hourly", minute: 0, overlap: "queue" },
    ]);
    await scheduler.tick();
    const before = await coordination.read(tickKey);
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    await coordination.compareAndSet(tickKey, "2026-11-03T08:00:20.000Z", before);
    // Its own run is still going: not started again, and neither queued nor skipped.
    expect(await scheduler.tick()).toMatchObject({ started: [], queued: [], skipped: [] });
    expect(executor.requests.length).toBe(1);
  });

  it("starts each due run once when two hosts tick the same workspace", async () => {
    const shared = { coordination: new TestCoordination(), executor: new TestExecutor() };
    const one = setUp([{ key: "p/hourly", minute: 0 }], { shared });
    const two = setUp([{ key: "p/hourly", minute: 0 }], { shared });
    await one.scheduler.tick();
    one.at("2026-11-03T08:00:20Z");
    two.at("2026-11-03T08:00:20Z");
    await Promise.all([one.scheduler.tick(), two.scheduler.tick()]);
    expect(shared.executor.runs.size).toBe(1);
  });

  it("needs the same workspace id on every host, not each host's path", async () => {
    const tickBoth = async (laptopId: string, serverId: string) => {
      const shared = { coordination: new TestCoordination(), executor: new TestExecutor() };
      const laptop = setUp([{ key: "p/hourly", minute: 0 }], { shared, workspaceId: laptopId });
      const server = setUp([{ key: "p/hourly", minute: 0 }], { shared, workspaceId: serverId });
      await laptop.scheduler.tick();
      await server.scheduler.tick();
      laptop.at("2026-11-03T08:00:20Z");
      server.at("2026-11-03T08:00:20Z");
      await Promise.all([laptop.scheduler.tick(), server.scheduler.tick()]);
      return shared.executor.runs.size;
    };
    expect(await tickBoth(workspace, workspace)).toBe(1);
    // Why the id must not be a path: each host would key the same fire differently.
    expect(await tickBoth("/home/ana/demo", "/srv/halonic/demo")).toBe(2);
  });

  it("ignores a tick while one runs, and every tick after dispose", async () => {
    const { scheduler, executor, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    const [first, overlapping] = await Promise.all([scheduler.tick(), scheduler.tick()]);
    expect([first.started.length, overlapping.started.length]).toEqual([1, 0]);
    await scheduler.dispose();
    at("2026-11-03T09:00:20Z");
    expect((await scheduler.tick()).started).toEqual([]);
    expect(executor.requests.length).toBe(1);
  });

  it("keeps workspaces that share coordination and a run store apart", async () => {
    const shared = { coordination: new TestCoordination(), executor: new TestExecutor() };
    const first = setUp([{ key: "@workspace/hourly", minute: 0 }], { shared, workspaceId: "a" });
    const second = setUp([{ key: "@workspace/hourly", minute: 0 }], { shared, workspaceId: "b" });
    await first.scheduler.tick();
    await second.scheduler.tick();
    first.at("2026-11-03T08:00:20Z");
    second.at("2026-11-03T08:00:20Z");
    await first.scheduler.tick();
    const { started } = await second.scheduler.tick();
    expect(started).toHaveLength(1);
    expect(shared.executor.runs.size).toBe(2);
  });

  it("waits on dispose for a tick in progress, which then starts nothing more", async () => {
    const { scheduler, coordination, executor, ticks, at } = setUp([
      { key: "p/one", minute: 0 },
      { key: "p/two", minute: 0 },
    ]);
    await scheduler.tick();
    const stored = await coordination.read(tickKey);
    let release = () => {};
    executor.hold = new Promise((resolve) => {
      release = resolve;
    });
    at("2026-11-03T08:00:20Z");
    const ticking = scheduler.tick();
    // Let the tick reach the first start, which waits for `release`.
    await new Promise((resolve) => setTimeout(resolve, 0));
    let disposed = false;
    const disposing = scheduler.dispose().then(() => {
      disposed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed).toBe(false);
    release();
    await disposing;
    expect((await ticking).started.map((run) => run.trigger?.routineId)).toEqual(["p/one"]);
    expect(executor.requests).toHaveLength(1);
    expect(await coordination.read(tickKey)).toBe(stored);
    expect(ticks).toHaveLength(1);
  });

  it("starts an agent routine with its trigger and run id", async () => {
    const { scheduler, executor, at } = setUp([{ key: "p/ask", minute: 0, agent: "a" }]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    const [run] = (await scheduler.tick()).started;
    expect(run).toMatchObject({
      workflowId: "agent:a",
      trigger: { type: "schedule", routineId: "p/ask" },
    });
    expect(executor.requests[0]).toMatchObject({
      agentId: "a",
      runId: routineRunId(workspace, "p/ask", new Date("2026-11-03T08:00:00Z")),
    });
  });

  it("reports a run that fails to start, starts the others and moves on", async () => {
    const { scheduler, executor, ticks, at } = setUp([
      { key: "p/broken", minute: 0, agent: "ghost" },
      { key: "p/hourly", minute: 0 },
    ]);
    executor.failOn = "ghost";
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    const { started, failed } = await scheduler.tick();
    expect(ids(started)).toEqual([
      routineRunId(workspace, "p/hourly", new Date("2026-11-03T08:00:00Z")),
    ]);
    expect(failed.map((failure) => [failure.key, failure.at, failure.error.message])).toEqual([
      ["p/broken", "2026-11-03T08:00:00.000Z", "no such workflow: agent:ghost"],
    ]);
    expect(ticks.at(-1)).toMatchObject({
      at: "2026-11-03T08:00:20.000Z",
      failed: [{ key: "p/broken" }],
    });
    at("2026-11-03T08:30:00Z");
    expect((await scheduler.tick()).failed).toEqual([]);
  });

  it("wraps a thrown non-error in an Error", async () => {
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0 }], {
      startOf: () => {
        throw "no hub";
      },
    });
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    expect((await scheduler.tick()).failed[0]?.error.message).toBe("no hub");
  });
});

verifies("app.routine-overlap", () => {
  it("counts only this workspace's runs as busy", async () => {
    const executor = new TestExecutor();
    const shared = { coordination: new TestCoordination(), executor };
    const routine: TestRoutine = { key: "@workspace/hourly", minute: 0, overlap: "skip" };
    const mine = setUp([routine], { shared });
    const theirs = setUp([routine], { shared, workspaceId: "ws-other" });
    await Promise.all([mine.scheduler.tick(), theirs.scheduler.tick()]);
    theirs.at("2026-11-03T08:00:20Z");
    await theirs.scheduler.tick();
    mine.at("2026-11-03T08:00:20Z");
    expect((await mine.scheduler.tick()).started).toHaveLength(1);
  });

  it("queues at most MAX_QUEUED times per routine and skips the rest", async () => {
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0, overlap: "queue" }]);
    await scheduler.tick();
    at("2026-11-08T07:00:30Z");
    const { started, queued, skipped } = await scheduler.tick();
    expect([started.length, queued.length, skipped.length]).toEqual([1, MAX_QUEUED, 19]);
    expect(queued.at(-1)?.at).toBe("2026-11-07T12:00:00.000Z");
  });

  it("keeps the stored queue within a Coordination value, skipping the newest times", async () => {
    const routines = Array.from({ length: 30 }, (_, index) => ({
      key: `p/hourly-${index}`,
      minute: 0,
      overlap: "queue" as const,
    }));
    const { scheduler, coordination, at } = setUp(routines);
    await scheduler.tick();
    at("2026-11-08T07:00:30Z");
    const { queued, skipped } = await scheduler.tick();
    const stored = (await coordination.read(queueKey(workspace))) ?? "";
    expect(utf8Length(stored)).toBeLessThanOrEqual(60_000);
    expect(queued.length + skipped.length).toBe(30 * 119);
    const newestQueued = Math.max(...queued.map((time) => Date.parse(time.at)));
    expect(skipped.every((time) => Date.parse(time.at) >= newestQueued)).toBe(true);
  });

  it("asks for a queued time again when another host changed the queue first", async () => {
    const { scheduler, coordination, executor, at } = setUp([
      { key: "p/hourly", minute: 0, overlap: "queue" },
    ]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    // Another host stores its own queue between this tick's read and its write, so this tick
    // loses the queue write; the last-tick write would still win, as the other host is slower.
    const write = coordination.compareAndSet.bind(coordination);
    coordination.compareAndSet = async (key, expected, next) => {
      if (key === queueKey(workspace)) {
        await write(key, expected, "{}");
      }
      return write(key, expected, next);
    };
    at("2026-11-03T09:00:20Z");
    expect((await scheduler.tick()).queued).toHaveLength(1);
    coordination.compareAndSet = write;
    expect(await coordination.read(tickKey)).toBe("2026-11-03T08:00:20.000Z");
    executor.end(routineRunId(workspace, "p/hourly", new Date("2026-11-03T08:00:00Z")));
    at("2026-11-03T09:10:00Z");
    expect(ids((await scheduler.tick()).started)).toEqual([
      routineRunId(workspace, "p/hourly", new Date("2026-11-03T09:00:00Z")),
    ]);
  });

  it("drops a queued time when its routine is removed", async () => {
    const routines: TestRoutine[] = [{ key: "p/hourly", minute: 0, overlap: "queue" }];
    const { scheduler, coordination, executor, at } = setUp(routines);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    at("2026-11-03T09:00:20Z");
    expect((await scheduler.tick()).queued).toHaveLength(1);
    routines.length = 0;
    executor.end(routineRunId(workspace, "p/hourly", new Date("2026-11-03T08:00:00Z")));
    at("2026-11-03T09:10:00Z");
    expect(await scheduler.tick()).toMatchObject({ started: [], queued: [] });
    expect(await coordination.read(queueKey(workspace))).toBeNull();
  });

  it("treats a damaged stored queue as empty", async () => {
    const { scheduler, coordination, at } = setUp([
      { key: "p/hourly", minute: 0, overlap: "queue" },
    ]);
    await scheduler.tick();
    await coordination.compareAndSet(queueKey(workspace), null, '{"p/hourly": "soon"');
    at("2026-11-03T08:00:20Z");
    const { started, queued } = await scheduler.tick();
    expect([started.length, queued.length]).toEqual([1, 0]);
    expect(await coordination.read(queueKey(workspace))).toBeNull();
  });
});
