import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { queueKey } from "./routine-ids.ts";
import { MAX_QUEUED } from "./routine-overlap.ts";
import { setUp, workspace } from "./testing/routine-scheduler-harness.ts";

verifies("app.scheduler-reads-queue", () => {
  it("gives each routine's queued count, first and last time, by key", async () => {
    const { scheduler, at } = setUp([
      { key: "p/b-hourly", minute: 0, overlap: "queue" },
      { key: "p/a-hourly", minute: 30, overlap: "queue" },
      { key: "p/allowed", minute: 15 },
    ]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    at("2026-11-03T10:40:00Z");
    const { queued } = await scheduler.tick();
    expect(queued.length).toBe(5);
    expect(await scheduler.queuedTimes()).toEqual([
      {
        key: "p/a-hourly",
        count: 3,
        first: "2026-11-03T08:30:00.000Z",
        last: "2026-11-03T10:30:00.000Z",
      },
      {
        key: "p/b-hourly",
        count: 2,
        first: "2026-11-03T09:00:00.000Z",
        last: "2026-11-03T10:00:00.000Z",
      },
    ]);
  });

  it("reads the stored queue without a tick, as after a restart", async () => {
    const first = setUp([{ key: "p/hourly", minute: 0, overlap: "queue" }]);
    await first.scheduler.tick();
    first.at("2026-11-08T07:00:30Z");
    await first.scheduler.tick();
    const shared = { coordination: first.coordination, executor: first.executor };
    const restarted = setUp([{ key: "p/hourly", minute: 0, overlap: "queue" }], { shared });
    const requests = first.executor.requests.length;
    expect(await restarted.scheduler.queuedTimes()).toEqual([
      {
        key: "p/hourly",
        count: MAX_QUEUED,
        first: "2026-11-03T09:00:00.000Z",
        last: "2026-11-07T12:00:00.000Z",
      },
    ]);
    expect(first.executor.requests.length).toBe(requests);
  });

  it("gives an empty list when nothing is queued or the stored queue can't be read", async () => {
    const { scheduler, coordination } = setUp([{ key: "p/hourly", minute: 0, overlap: "queue" }]);
    expect(await scheduler.queuedTimes()).toEqual([]);
    coordination.values.set(queueKey(workspace), "{not json");
    expect(await scheduler.queuedTimes()).toEqual([]);
    coordination.values.set(queueKey(workspace), JSON.stringify({ "p/hourly": [] }));
    expect(await scheduler.queuedTimes()).toEqual([]);
  });
});
