import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ids, setUp, tickKey } from "./testing/routine-scheduler-harness.ts";

verifies("app.routine-clock-set-back", () => {
  it("goes on from the clock's time when the stored last tick is far ahead of it", async () => {
    const { scheduler, coordination, executor, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    // Stored by a host whose clock was two days ahead.
    await coordination.compareAndSet(tickKey, null, "2026-11-05T07:00:00.000Z");

    expect((await scheduler.tick()).started).toEqual([]);
    expect(await coordination.read(tickKey)).toBe("2026-11-03T07:00:30.000Z");

    at("2026-11-03T08:00:20Z");
    const { started } = await scheduler.tick();
    expect(started.map((run) => run.trigger?.at)).toEqual(["2026-11-03T08:00:00.000Z"]);
    expect(executor.runs.size).toBe(1);
  });

  it("waits for a stored last tick only a little ahead, as another host's clock may be", async () => {
    const { scheduler, coordination } = setUp([{ key: "p/hourly", minute: 0 }]);
    await coordination.compareAndSet(tickKey, null, "2026-11-03T07:05:00.000Z");

    expect(ids((await scheduler.tick()).started)).toEqual([]);
    expect(await coordination.read(tickKey)).toBe("2026-11-03T07:05:00.000Z");
  });
});
