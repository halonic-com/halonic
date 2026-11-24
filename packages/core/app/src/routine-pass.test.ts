import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { passRoutineTick } from "./routine-pass.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { setUp, tickKey, workspace } from "./testing/routine-scheduler-harness.ts";
import { TestExecutor } from "./testing/test-executor.ts";

/** Passes the workspace's tick with the clock at `iso`. */
function passAt(coordination: TestCoordination, iso: string): Promise<boolean> {
  return passRoutineTick({
    workspaceId: workspace,
    clock: { now: () => new Date(iso) },
    coordination,
  });
}

verifies("app.routine-pass", () => {
  it("skips the times due while passed, and the next tick starts only the new one", async () => {
    const shared = { coordination: new TestCoordination(), executor: new TestExecutor() };
    const { coordination, executor } = shared;
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0 }], { shared });
    await scheduler.tick();
    expect(await passAt(coordination, "2026-11-03T08:30:00Z")).toBe(true);
    expect(await passAt(coordination, "2026-11-03T09:30:00Z")).toBe(true);
    expect(await coordination.read(tickKey)).toBe("2026-11-03T09:30:00.000Z");
    at("2026-11-03T10:00:30Z");
    const { started } = await scheduler.tick();
    expect(started.map((run) => run.trigger?.at)).toEqual(["2026-11-03T10:00:00.000Z"]);
    expect(executor.runs.size).toBe(1);
  });

  it("leaves a last tick at or after the clock's time", async () => {
    const coordination = new TestCoordination();
    coordination.values.set(tickKey, "2026-11-03T09:00:00.000Z");
    expect(await passAt(coordination, "2026-11-03T08:00:00Z")).toBe(false);
    expect(await passAt(coordination, "2026-11-03T09:00:00Z")).toBe(false);
    expect(await coordination.read(tickKey)).toBe("2026-11-03T09:00:00.000Z");
  });

  it("stores the first tick of a workspace that never ticked", async () => {
    const coordination = new TestCoordination();
    expect(await passAt(coordination, "2026-11-03T08:00:00Z")).toBe(true);
    expect(await coordination.read(tickKey)).toBe("2026-11-03T08:00:00.000Z");
  });

  it("leaves a tick another instance stored meanwhile", async () => {
    const coordination = new TestCoordination();
    // The pass reads no tick, then another instance's tick lands before its write.
    coordination.read = async () => null;
    coordination.values.set(tickKey, "2026-11-03T07:59:00.000Z");
    expect(await passAt(coordination, "2026-11-03T08:00:00Z")).toBe(false);
    expect(coordination.values.get(tickKey)).toBe("2026-11-03T07:59:00.000Z");
  });
});
