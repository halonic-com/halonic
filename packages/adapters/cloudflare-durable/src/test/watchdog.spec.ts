// The watchdog inside workerd: which runs it wakes and why (see `watchdog.test.ts`).

import { describe, expect, it } from "vitest";
import { watchdogTimerId, whyStuck } from "../watchdog.ts";
import { hour, minute, newWatchdog } from "./watchdog-case.ts";

describe("Watchdog", () => {
  it("wakes nothing for a run that waits days for an approval", async () => {
    const t = newWatchdog();
    t.add("approval", "waiting", {
      lastEventAt: t.agoIso(3 * 24 * hour),
      overdueMs: 0,
      ended: false,
    });
    const report = await t.watchdog.sweep();
    expect(report).toEqual({ woken: [], failed: [], deferred: 0 });
    expect(t.scheduled).toEqual([]);
  });

  it("wakes a waiting run whose timer was due 5 minutes ago, with the watchdog timer set for now", async () => {
    const t = newWatchdog();
    t.add("late", "waiting", {
      lastEventAt: t.agoIso(hour),
      overdueMs: 5 * minute,
      ended: false,
    });
    const report = await t.watchdog.sweep();
    expect(report.woken).toEqual([{ runId: "late", reason: "overdue-timer" }]);
    expect(t.scheduled).toEqual([
      { key: "late", timerId: watchdogTimerId, at: t.clock.now().toISOString() },
    ]);
  });

  it("wakes a running run with no event for 15 minutes, and not one with a recent event", async () => {
    const t = newWatchdog();
    t.add("stuck", "running", { lastEventAt: t.agoIso(15 * minute), overdueMs: 0, ended: false });
    t.add("busy", "running", { lastEventAt: t.agoIso(minute), overdueMs: 0, ended: false });
    const report = await t.watchdog.sweep();
    expect(report.woken).toEqual([{ runId: "stuck", reason: "no-progress" }]);
  });

  it("wakes nothing for a timer that is only a moment overdue", async () => {
    const t = newWatchdog();
    t.add("moment", "waiting", { lastEventAt: t.agoIso(hour), overdueMs: 30_000, ended: false });
    expect((await t.watchdog.sweep()).woken).toEqual([]);
  });

  it("reports a run whose check fails and still checks the others", async () => {
    const t = newWatchdog();
    t.add("broken", "running", new Error("the object does not answer"));
    t.add("late", "waiting", { lastEventAt: null, overdueMs: 10 * minute, ended: false });
    const report = await t.watchdog.sweep();
    expect(report.woken).toEqual([{ runId: "late", reason: "overdue-timer" }]);
    expect(report.failed.map(({ runId, error }) => [runId, error.message])).toEqual([
      ["broken", "the object does not answer"],
    ]);
  });

  it("checks every run when there are more than it asks at once", async () => {
    const t = newWatchdog(25);
    for (let run = 0; run < 25; run++) {
      t.add(`run_${run}`, "waiting", { lastEventAt: null, overdueMs: 10 * minute, ended: false });
    }
    expect((await t.watchdog.sweep()).woken).toHaveLength(25);
  });
});

describe("whyStuck", () => {
  const limits = { quietAfterMs: 10 * minute, overdueAfterMs: 2 * minute };

  it("counts a running run with an empty log as not stuck, since it has not begun", () => {
    expect(
      whyStuck("running", { lastEventAt: null, overdueMs: 0, ended: false }, Date.now(), limits),
    ).toBeNull();
  });

  it("wakes at exactly the limits", () => {
    const now = Date.parse("2026-11-13T10:00:00Z");
    const quiet = new Date(now - 10 * minute).toISOString();
    expect(
      whyStuck("running", { lastEventAt: quiet, overdueMs: 0, ended: false }, now, limits),
    ).toBe("no-progress");
    expect(
      whyStuck("waiting", { lastEventAt: quiet, overdueMs: 2 * minute, ended: false }, now, limits),
    ).toBe("overdue-timer");
  });
});
