import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { failedRunNotices } from "./failed-run-notices.ts";

const now = new Date(2026, 10, 16, 12, 0);
const routineName = (id: string) => (id === "acme/daily" ? "Daily summary" : id);

/** A run that a routine started and that ended at the given local time of 16 Nov. */
function routineRun(id: string, hour: number, minute: number, fields: Partial<RunSummary> = {}) {
  const endedAt = new Date(2026, 10, 16, hour, minute).toISOString();
  return waitingRun(id, {
    status: "failed",
    state: null,
    endedAt,
    trigger: { type: "schedule", routineId: "acme/daily", at: endedAt },
    ...fields,
  });
}

verifies("inbox.notices.failed-run", () => {
  it("makes one notice for a failed routine run, which opens that run", () => {
    const [notice, ...others] = failedRunNotices([routineRun("r1", 6, 0)], routineName, now);
    expect(others).toEqual([]);
    expect(notice).toMatchObject({
      title: "Daily summary failed at 06:00",
      runId: "r1",
      count: 1,
      fixed: false,
    });
  });

  it("groups a routine's failures of one day and opens the newest", () => {
    const runs = [routineRun("r1", 6, 0), routineRun("r2", 6, 30)];
    const notices = failedRunNotices(runs, routineName, now);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      title: "Daily summary failed · 2 times today",
      runId: "r2",
      count: 2,
    });
  });

  it("makes a notice for each day, newest first", () => {
    const yesterday = new Date(2026, 10, 15, 6, 0).toISOString();
    const runs = [
      routineRun("old", 6, 0, {
        endedAt: yesterday,
        trigger: { type: "schedule", routineId: "acme/daily", at: yesterday },
      }),
      routineRun("new", 6, 0),
    ];
    expect(failedRunNotices(runs, routineName, now).map((notice) => notice.runId)).toEqual([
      "new",
      "old",
    ]);
  });

  it("says fixed once a later run of the routine finished", () => {
    const runs = [routineRun("r1", 6, 0), routineRun("r2", 7, 0, { status: "completed" })];
    expect(failedRunNotices(runs, routineName, now)[0]?.fixed).toBe(true);
  });

  it("keeps a failure that a run before it finished", () => {
    const runs = [routineRun("r1", 6, 0, { status: "completed" }), routineRun("r2", 7, 0)];
    expect(failedRunNotices(runs, routineName, now)[0]?.fixed).toBe(false);
  });

  it("makes none for a run started by hand, a Try it run, a cancel or a budget stop", () => {
    const runs = [
      routineRun("by-hand", 6, 0, { trigger: null }),
      routineRun("manual", 6, 1, { trigger: { type: "manual", at: "2026-11-16T06:01:00.000Z" } }),
      routineRun("try-it", 6, 2, { kind: "test" }),
      routineRun("cancelled", 6, 3, { reason: "cancelled" }),
      routineRun("budget", 6, 4, { reason: "budget" }),
    ];
    expect(failedRunNotices(runs, routineName, now)).toEqual([]);
  });

  it("keeps the notice's key free of anything but the routine and the day", () => {
    const [notice] = failedRunNotices(
      [routineRun("r1", 6, 0, { error: "fin@acme.example is signed out." })],
      routineName,
      now,
    );
    expect(notice?.key).toBe("failed-run:acme/daily:2026-11-16");
  });
});
