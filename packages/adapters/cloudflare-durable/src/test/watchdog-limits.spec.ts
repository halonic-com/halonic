// The watchdog's limits inside workerd: a lagging run list and the calls of one sweep (see
// `watchdog.test.ts`).

import { describe, expect, it } from "vitest";
import { defaultMaxRunsPerSweep } from "../watchdog.ts";
import { hour, minute, newWatchdog } from "./watchdog-case.ts";

describe("a lagging run list", () => {
  it("does not wake a run the list still shows as running but whose own log has ended", async () => {
    const t = newWatchdog();
    t.add("over", "running", { lastEventAt: t.agoIso(hour), overdueMs: 0, ended: true });
    t.add("quiet", "running", { lastEventAt: t.agoIso(hour), overdueMs: 0, ended: false });
    const report = await t.watchdog.sweep();
    expect(report.woken).toEqual([{ runId: "quiet", reason: "no-progress" }]);
  });
});

describe("a limit on the calls of one sweep", () => {
  function manyStuckRuns(count: number, maxRunsPerSweep?: number) {
    const t = newWatchdog(maxRunsPerSweep);
    for (let run = 0; run < count; run++) {
      t.add(`run_${String(run).padStart(2, "0")}`, "waiting", {
        lastEventAt: null,
        overdueMs: 10 * minute,
        ended: false,
      });
    }
    return t;
  }

  it("checks at most the limit in one sweep and says how many it left for later", async () => {
    const t = manyStuckRuns(25, 10);
    const report = await t.watchdog.sweep();
    expect(report.woken).toHaveLength(10);
    expect(report.deferred).toBe(15);
  });

  it("takes the runs in turn, so every run is checked within a few minutes", async () => {
    const t = manyStuckRuns(25, 10);
    const checked = new Set<string>();
    for (let sweep = 0; sweep < 3; sweep++) {
      const report = await t.watchdog.sweep();
      for (const { runId } of report.woken) checked.add(runId);
      t.clock.advance(minute);
    }
    expect(checked.size).toBe(25);
  });

  it("stays within the calls of one invocation when every run in the group is stuck", async () => {
    const callLimit = 50;
    const callsBeforeTheRuns = 2; // the run list and the routines tick
    const t = manyStuckRuns(100, defaultMaxRunsPerSweep);
    const report = await t.watchdog.sweep();
    const checks = report.woken.length + report.failed.length;
    const wakes = t.scheduled.length;
    expect(wakes).toBe(defaultMaxRunsPerSweep);
    expect(callsBeforeTheRuns + checks + wakes).toBeLessThanOrEqual(callLimit);
  });

  it("checks 20 runs in a sweep when no limit is given", async () => {
    const t = manyStuckRuns(100);
    const report = await t.watchdog.sweep();
    expect(report.woken).toHaveLength(20);
    expect(report.deferred).toBe(80);
  });

  it("checks everything at once when the runs fit the limit", async () => {
    const t = manyStuckRuns(5, 10);
    expect(await t.watchdog.sweep()).toMatchObject({ deferred: 0 });
  });
});
