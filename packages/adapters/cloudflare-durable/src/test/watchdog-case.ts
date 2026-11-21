/**
 * The watchdog of the watchdog specs, over run objects that have the health the test gives them.
 * Test code only: never import it from a runtime bundle.
 */

import type { RunStatus, RunSummary } from "@halonicjs/events";
import { fixedClockStart } from "@halonicjs/std";
import type { RunHealth } from "../run-object-api.ts";
import { Watchdog } from "../watchdog.ts";
import { SuiteClock } from "./suite-case.ts";

export const minute = 60 * 1000;
export const hour = 60 * minute;

/** The run objects as the watchdog sees them: each run has the health the test gives it. */
export function newWatchdog(maxRunsPerSweep?: number) {
  // A fixed start, so a sweep takes the same group of runs (chosen by the minute) every time.
  const clock = new SuiteClock(fixedClockStart);
  const runs = new Map<string, { status: RunStatus; health: RunHealth | Error }>();
  const scheduled: { key: string; timerId: string; at: string }[] = [];
  const watchdog = new Watchdog({
    clock,
    ...(maxRunsPerSweep === undefined ? {} : { maxRunsPerSweep }),
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
