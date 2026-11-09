import type { Routine } from "@halonicjs/format";
import { due, nextRun, occurrences } from "../src/index.ts";

// One routine: every weekday at 08:00 in Amsterdam. Normally it comes from a
// `*.routine.yaml` file read with @halonicjs/format.
const routine: Routine = {
  version: 1,
  id: "morning-brief",
  name: "Morning brief",
  enabled: true,
  trigger: { schedule: "0 8 * * 1-5", timezone: "Europe/Amsterdam" },
  run: { workflow: "brief", input: {} },
  overlap: "skip",
  catchUp: "last",
};

// A fixed clock keeps the output the same on every run: Monday 9 November 2026, 08:05 in Amsterdam.
const now = new Date("2026-11-09T07:05:00Z");

/** Reads one routine's trigger and lists what is due now and its next due times. */
export function runExample(): { dueNow: string[]; next: string | null; nextWeek: string[] } {
  // What a tick at `now` starts, when the last tick was on Friday afternoon.
  const lastTick = new Date("2026-11-06T15:00:00Z");
  const runs = due([{ hub: null, routine }], lastTick, now);
  const dueNow = runs.map((run) => `${run.key} at ${run.at.toISOString()}`);
  // ["@workspace/morning-brief at 2026-11-09T07:00:00.000Z"]

  // The next time the trigger fires, strictly after now.
  const next = nextRun(routine.trigger, now)?.toISOString() ?? null; // "2026-11-10T07:00:00.000Z"

  // Every time it fires in the coming week; the weekend is skipped.
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeek = occurrences(routine.trigger, now, weekEnd).map((at) => at.toISOString());

  return { dueNow, next, nextWeek };
}
