import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { shortHash, skipsKeyByHash } from "./routine-ids.ts";
import { addSkips, SkipRecords, type TargetUnavailableWhy } from "./routine-skips.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { setUp, workspace } from "./testing/routine-scheduler-harness.ts";

/** A target check that answers from `whys` by routine key, and notes each time it was asked about. */
function targets(whys: Record<string, TargetUnavailableWhy | Error>) {
  const asked: string[] = [];
  const targetUnavailable = async (run: { key: string; at: Date }) => {
    asked.push(`${run.key} ${run.at.toISOString()}`);
    const why = whys[run.key] ?? null;
    if (why instanceof Error) {
      throw why;
    }
    return why;
  };
  return { asked, targetUnavailable };
}

verifies("app.scheduler-skip-target-unavailable", () => {
  it("records a time whose target was never live as a skip, and starts nothing", async () => {
    const { targetUnavailable } = targets({ "support/morning": "never-live" });
    const { scheduler, executor, at } = setUp([{ key: "support/morning", minute: 0 }], {
      targetUnavailable,
    });
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");

    const tick = await scheduler.tick();

    expect(executor.requests).toEqual([]);
    expect(tick.unavailable).toEqual([
      { key: "support/morning", at: "2026-11-03T08:00:00.000Z", why: "never-live" },
    ]);
    expect(await scheduler.skippedTimes("support/morning")).toEqual([
      {
        reason: "target-unavailable",
        why: "never-live",
        from: "2026-11-03T08:00:00.000Z",
        to: "2026-11-03T08:00:00.000Z",
        count: 1,
        decidedAt: "2026-11-03T08:00:20.000Z",
      },
    ]);
  });

  it("continues one row for the same why, and starts a new row for another", async () => {
    const whys: Record<string, TargetUnavailableWhy> = { "support/hourly": "never-live" };
    const { targetUnavailable } = targets(whys);
    const { scheduler, at } = setUp([{ key: "support/hourly", minute: 0 }], { targetUnavailable });
    await scheduler.tick();
    for (const hour of ["08", "09"]) {
      at(`2026-11-03T${hour}:00:20Z`);
      await scheduler.tick();
    }
    whys["support/hourly"] = "in-trash";
    at("2026-11-03T10:00:20Z");
    await scheduler.tick();

    expect(
      (await scheduler.skippedTimes("support/hourly")).map((row) => [row.why, row.from, row.count]),
    ).toEqual([
      ["in-trash", "2026-11-03T10:00:00.000Z", 1],
      ["never-live", "2026-11-03T08:00:00.000Z", 2],
    ]);
  });

  it("asks only about the times the tick would start, so a busy time stays busy", async () => {
    const { asked, targetUnavailable } = targets({});
    const { scheduler, at } = setUp([{ key: "support/hourly", minute: 0, overlap: "skip" }], {
      targetUnavailable,
    });
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    at("2026-11-03T09:00:20Z");
    const busy = await scheduler.tick();

    expect(asked).toEqual(["support/hourly 2026-11-03T08:00:00.000Z"]);
    expect(busy.unavailable).toEqual([]);
    expect((await scheduler.skippedTimes("support/hourly")).map((row) => row.reason)).toEqual([
      "busy",
    ]);
  });

  it("fails only the run whose check throws, and starts the others", async () => {
    const { targetUnavailable } = targets({
      "support/broken": new Error("Can't read the version."),
    });
    const { scheduler, executor, at } = setUp(
      [
        { key: "support/broken", minute: 0 },
        { key: "support/fine", minute: 0 },
      ],
      { targetUnavailable },
    );
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");

    const tick = await scheduler.tick();

    expect(tick.failed.map((failure) => [failure.key, failure.error.message])).toEqual([
      ["support/broken", "Can't read the version."],
    ]);
    expect(executor.requests.map((request) => request.trigger?.routineId)).toEqual([
      "support/fine",
    ]);
    expect(await scheduler.skippedTimes("support/broken")).toEqual([]);
  });

  it("starts every run when no check is given", async () => {
    const { scheduler, executor, at } = setUp([{ key: "support/morning", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");

    expect((await scheduler.tick()).unavailable).toEqual([]);
    expect(executor.requests.length).toBe(1);
  });

  it("reads a stored row back with its why, and leaves out a row with a wrong one", async () => {
    const coordination = new TestCoordination();
    const records = new SkipRecords(coordination, workspace);
    const at = new Date("2026-11-03T08:00:00Z");
    const good = addSkips(
      [],
      [{ reason: "target-unavailable", why: "in-trash", from: at, to: at, count: 1 }],
      null,
      at,
    );
    const row = good[0];
    const bad = [
      { ...row, why: undefined },
      { ...row, why: "asleep" },
      { ...row, reason: "busy" },
    ];
    coordination.values.set(
      skipsKeyByHash(workspace, shortHash("support/morning")),
      JSON.stringify([...good, ...bad]),
    );

    expect(await records.read("support/morning")).toEqual(good);
  });
});
