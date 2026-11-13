import type { RunStatus, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ManualClock } from "./fakes.test-helper.ts";
import type { RunHealth } from "./run-object-api.ts";
import { Watchdog, watchdogTimerId, whyStuck } from "./watchdog.ts";

const minute = 60 * 1000;
const hour = 60 * minute;

/** The run objects as the watchdog sees them: each run has the health the test gives it. */
function newWatchdog() {
  const clock = new ManualClock();
  const runs = new Map<string, { status: RunStatus; health: RunHealth | Error }>();
  const scheduled: { key: string; timerId: string; at: string }[] = [];
  const watchdog = new Watchdog({
    clock,
    runs: {
      list: async () =>
        [...runs].map(([id, { status }]) => ({ id, status }) as unknown as RunSummary),
    },
    scheduler: {
      health: async (key) => {
        const run = runs.get(key);
        if (run === undefined || run.health instanceof Error) {
          throw run?.health ?? new Error("no such run");
        }
        return run.health;
      },
      schedule: async (key, timerId, at) => void scheduled.push({ key, timerId, at }),
    },
  });
  const agoIso = (ms: number) => new Date(clock.now().getTime() - ms).toISOString();
  return {
    watchdog,
    clock,
    scheduled,
    agoIso,
    add: (id: string, status: RunStatus, health: RunHealth | Error) =>
      void runs.set(id, { status, health }),
  };
}

verifies("cloudflare-durable.watchdog", () => {
  describe("Watchdog", () => {
    it("wakes nothing for a run that waits days for an approval", async () => {
      const t = newWatchdog();
      t.add("approval", "waiting", { lastEventAt: t.agoIso(3 * 24 * hour), overdueMs: 0 });
      const report = await t.watchdog.sweep();
      expect(report).toEqual({ woken: [], failed: [] });
      expect(t.scheduled).toEqual([]);
    });

    it("wakes a waiting run whose timer was due 5 minutes ago, with the watchdog timer set for now", async () => {
      const t = newWatchdog();
      t.add("late", "waiting", { lastEventAt: t.agoIso(hour), overdueMs: 5 * minute });
      const report = await t.watchdog.sweep();
      expect(report.woken).toEqual([{ runId: "late", reason: "overdue-timer" }]);
      expect(t.scheduled).toEqual([
        { key: "late", timerId: watchdogTimerId, at: t.clock.now().toISOString() },
      ]);
    });

    it("wakes a running run with no event for 15 minutes, and not one with a recent event", async () => {
      const t = newWatchdog();
      t.add("stuck", "running", { lastEventAt: t.agoIso(15 * minute), overdueMs: 0 });
      t.add("busy", "running", { lastEventAt: t.agoIso(minute), overdueMs: 0 });
      const report = await t.watchdog.sweep();
      expect(report.woken).toEqual([{ runId: "stuck", reason: "no-progress" }]);
    });

    it("wakes nothing for a timer that is only a moment overdue", async () => {
      const t = newWatchdog();
      t.add("moment", "waiting", { lastEventAt: t.agoIso(hour), overdueMs: 30_000 });
      expect((await t.watchdog.sweep()).woken).toEqual([]);
    });

    it("reports a run whose check fails and still checks the others", async () => {
      const t = newWatchdog();
      t.add("broken", "running", new Error("the object does not answer"));
      t.add("late", "waiting", { lastEventAt: null, overdueMs: 10 * minute });
      const report = await t.watchdog.sweep();
      expect(report.woken).toEqual([{ runId: "late", reason: "overdue-timer" }]);
      expect(report.failed.map(({ runId, error }) => [runId, error.message])).toEqual([
        ["broken", "the object does not answer"],
      ]);
    });

    it("checks every run when there are more than it asks at once", async () => {
      const t = newWatchdog();
      for (let run = 0; run < 25; run++) {
        t.add(`run_${run}`, "waiting", { lastEventAt: null, overdueMs: 10 * minute });
      }
      expect((await t.watchdog.sweep()).woken).toHaveLength(25);
    });
  });

  describe("whyStuck", () => {
    const limits = { quietAfterMs: 10 * minute, overdueAfterMs: 2 * minute };

    it("counts a running run with an empty log as not stuck, since it has not begun", () => {
      expect(
        whyStuck("running", { lastEventAt: null, overdueMs: 0 }, Date.now(), limits),
      ).toBeNull();
    });

    it("wakes at exactly the limits", () => {
      const now = Date.parse("2026-11-13T10:00:00Z");
      const quiet = new Date(now - 10 * minute).toISOString();
      expect(whyStuck("running", { lastEventAt: quiet, overdueMs: 0 }, now, limits)).toBe(
        "no-progress",
      );
      expect(whyStuck("waiting", { lastEventAt: quiet, overdueMs: 2 * minute }, now, limits)).toBe(
        "overdue-timer",
      );
    });
  });
});
