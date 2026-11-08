import type { Routine, RoutineTrigger } from "@halonicjs/format";
import { CronError } from "./cron-error.ts";
import { occurrences } from "./occurrences.ts";
import { parseEvery } from "./parse-every.ts";

/** A routine together with the hub its file lives in; `null` is the workspace itself. */
export interface PlacedRoutine {
  hub: string | null;
  routine: Routine;
}

/** The settings every routine shares when deciding what is due. */
export interface TickPolicy {
  /** The zone for `schedule` triggers that name none. Core can't read this machine's zone. */
  timeZone: string;
  /** A due time still counts as on time while `now - at` is no more than this. */
  graceMs: number;
  /** The most missed times a routine with `catchUp: "all"` returns for one tick. */
  maxCatchUp: number;
}

export const DEFAULT_TICK_POLICY: TickPolicy = {
  timeZone: "UTC",
  graceMs: 60_000,
  maxCatchUp: 100,
};

/** One run the tick says to start. */
export interface DueRun {
  /** `<hub>/<routine id>`, or `@workspace/<routine id>` outside a hub. */
  key: string;
  placed: PlacedRoutine;
  /** When the run was due, not when the tick fired. */
  at: Date;
  trigger: "schedule" | "every";
}

// A window longer than this is cut short; the routine catches up on the rest next tick.
const WINDOW_LIMIT = 10_000;

/** The id a routine goes by in a due run. */
export function routineKey(placed: PlacedRoutine): string {
  return `${placed.hub ?? "@workspace"}/${placed.routine.id}`;
}

/**
 * The runs to start for a tick: for each enabled routine with a clock trigger,
 * the times in `(lastTick, now]` its `catchUp` setting lets it run, oldest
 * first (ties by key). `none` keeps only times within `policy.graceMs` of now,
 * `last` the newest, `all` every one up to `policy.maxCatchUp`. With no last
 * tick nothing is due. A routine whose trigger doesn't parse is skipped.
 */
export function due(
  routines: readonly PlacedRoutine[],
  lastTick: Date | null,
  now: Date,
  policy: TickPolicy = DEFAULT_TICK_POLICY,
): DueRun[] {
  if (!lastTick || now <= lastTick) return [];
  const runs: DueRun[] = [];
  for (const placed of routines) {
    if (!placed.routine.enabled) continue;
    for (const [at, trigger] of dueTimes(placed.routine, lastTick, now, policy)) {
      runs.push({ key: routineKey(placed), placed, at, trigger });
    }
  }
  return runs.sort((a, b) => a.at.getTime() - b.at.getTime() || compare(a.key, b.key));
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function dueTimes(
  routine: Routine,
  lastTick: Date,
  now: Date,
  policy: TickPolicy,
): Array<[Date, "schedule" | "every"]> {
  const trigger = routine.trigger;
  let times: Date[];
  let kind: "schedule" | "every";
  try {
    if ("schedule" in trigger) {
      kind = "schedule";
      times = scheduleTimes(trigger, lastTick, now, policy);
    } else if ("every" in trigger) {
      kind = "every";
      times = intervalTimes(parseEvery(trigger.every), lastTick, now, routine.catchUp);
    } else {
      return [];
    }
  } catch (error) {
    if (error instanceof CronError) return [];
    throw error;
  }
  return allowed(times, routine.catchUp, now, policy).map((at) => [at, kind]);
}

function scheduleTimes(
  trigger: Extract<RoutineTrigger, { schedule: string }>,
  lastTick: Date,
  now: Date,
  policy: TickPolicy,
): Date[] {
  const timezone = trigger.timezone ?? policy.timeZone;
  return occurrences({ ...trigger, timezone }, lastTick, now, WINDOW_LIMIT);
}

/** Multiples of the interval counted from the Unix epoch, in `(lastTick, now]`. */
function intervalTimes(
  intervalMs: number,
  lastTick: Date,
  now: Date,
  catchUp: Routine["catchUp"],
): Date[] {
  if (catchUp === "last") {
    // The newest slot, found directly so a long window costs nothing.
    const newest = Math.floor(now.getTime() / intervalMs) * intervalMs;
    return newest > lastTick.getTime() ? [new Date(newest)] : [];
  }
  const times: Date[] = [];
  let slot = (Math.floor(lastTick.getTime() / intervalMs) + 1) * intervalMs;
  while (slot <= now.getTime() && times.length < WINDOW_LIMIT) {
    times.push(new Date(slot));
    slot += intervalMs;
  }
  return times;
}

function allowed(
  times: Date[],
  catchUp: Routine["catchUp"],
  now: Date,
  policy: TickPolicy,
): Date[] {
  if (catchUp === "all") return times.slice(0, policy.maxCatchUp);
  if (catchUp === "last") return times.slice(-1);
  return times.filter((at) => now.getTime() - at.getTime() <= policy.graceMs);
}
