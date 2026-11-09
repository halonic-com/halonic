import type { Routine, RoutineTrigger } from "@halonicjs/format";
import { CronError } from "./cron-error.ts";
import { slotAfter, slotAtOrBefore } from "./interval-slots.ts";
import { nextCronTime } from "./next-cron-time.ts";
import { occurrences } from "./occurrences.ts";
import { type Cron, parseCron } from "./parse-cron.ts";
import { parseEvery } from "./parse-every.ts";
import { checkTimeZone, DEFAULT_TIME_ZONE, MINUTE } from "./time-zone.ts";

/** A routine together with the hub its file lives in; `null` is the workspace itself. */
export interface PlacedRoutine {
  hub: string | null;
  routine: Routine;
}

/** The settings every routine shares when deciding what is due. */
export interface TickPolicy {
  /**
   * The zone for `schedule` triggers that name none. Core can't read this
   * machine's zone. When it is unknown, only those triggers are skipped.
   */
  timeZone: string;
  /** A due time still counts as on time while `now - at` is no more than this. */
  graceMs: number;
  /**
   * The most missed times a routine with `catchUp: "all"` returns for one
   * tick: the newest ones, started oldest first. Older missed times past the
   * cap are dropped, not caught up next tick.
   */
  maxCatchUp: number;
}

export const DEFAULT_TICK_POLICY: TickPolicy = {
  timeZone: DEFAULT_TIME_ZONE,
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

// No walk through a window lists more times than this, whatever the grace
// period or catch-up cap; times past it are dropped, not caught up next tick.
const WINDOW_LIMIT = 10_000;

/** The id a routine goes by in a due run. */
export function routineKey(placed: PlacedRoutine): string {
  return `${placed.hub ?? "@workspace"}/${placed.routine.id}`;
}

/**
 * The runs to start for a tick: for each enabled routine with a clock trigger,
 * the times in `(lastTick, now]` its `catchUp` setting lets it run, oldest
 * first (ties by key). `none` keeps only times within `policy.graceMs` of now,
 * `last` the newest, `all` the newest `policy.maxCatchUp`. With no last tick
 * nothing is due. A routine whose trigger doesn't parse, or whose schedule
 * is in a zone this runtime doesn't know, is skipped; the others still run.
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

type ScheduleTrigger = Extract<RoutineTrigger, { schedule: string }>;

/** The times a clock trigger fires, in a window after `from` up to and including `to`. */
interface Clock {
  kind: DueRun["trigger"];
  /** The oldest times in the window, at most `limit` of them. */
  times(from: Date, to: Date, limit: number): Date[];
  /** The newest time in the window, found without walking through the older ones. */
  newest(from: Date, to: Date): Date | null;
}

function dueTimes(
  routine: Routine,
  lastTick: Date,
  now: Date,
  policy: TickPolicy,
): Array<[Date, DueRun["trigger"]]> {
  let clock: Clock | null;
  try {
    clock = clockFor(routine.trigger, policy);
  } catch (error) {
    if (error instanceof CronError) return [];
    throw error;
  }
  if (!clock) return [];
  const kind = clock.kind;
  return allowedTimes(clock, routine.catchUp, lastTick, now, policy).map((at) => [at, kind]);
}

/**
 * Only the part of the window a `catchUp` setting keeps is searched, so a
 * long window, after the machine slept for days, costs no more than a short one.
 */
function allowedTimes(
  clock: Clock,
  catchUp: Routine["catchUp"],
  lastTick: Date,
  now: Date,
  policy: TickPolicy,
): Date[] {
  if (catchUp === "all") {
    return newestTimes(clock, lastTick, now, Math.min(policy.maxCatchUp, WINDOW_LIMIT));
  }
  if (catchUp === "last") {
    const newest = clock.newest(lastTick, now);
    return newest ? [newest] : [];
  }
  // The window opens just before `now - graceMs`, so a time exactly that late still counts.
  const graceStart = new Date(now.getTime() - policy.graceMs - 1);
  const from = graceStart > lastTick ? graceStart : lastTick;
  return clock.times(from, now, WINDOW_LIMIT);
}

/**
 * The newest times in the window, at most `limit` of them, oldest first. Each
 * one is the newest time before the one found last, so the older part of a
 * long window is never walked.
 */
function newestTimes(clock: Clock, from: Date, to: Date, limit: number): Date[] {
  const times: Date[] = [];
  let end = to;
  while (times.length < limit) {
    const time = clock.newest(from, end);
    if (!time) break;
    times.push(time);
    end = new Date(time.getTime() - 1);
  }
  return times.reverse();
}

/** @throws {CronError} when the cron or interval doesn't parse, or the zone is unknown */
function clockFor(trigger: RoutineTrigger, policy: TickPolicy): Clock | null {
  if ("schedule" in trigger) {
    return scheduleClock({ ...trigger, timezone: trigger.timezone ?? policy.timeZone });
  }
  if ("every" in trigger) return intervalClock(parseEvery(trigger.every));
  return null;
}

/** @throws {CronError} when the cron doesn't parse or the zone is unknown */
function scheduleClock(trigger: ScheduleTrigger & { timezone: string }): Clock {
  const cron = parseCron(trigger.schedule);
  // Checked here, so an unknown zone skips this routine instead of throwing a
  // RangeError out of the tick and stopping every routine.
  checkTimeZone(trigger.timezone);
  return {
    kind: "schedule",
    times: (from, to, limit) => occurrences(trigger, from, to, limit),
    newest: (from, to) => newestCronTime(cron, trigger.timezone, from, to),
  };
}

/** Multiples of the interval counted from the Unix epoch; see `interval-slots.ts`. */
function intervalClock(intervalMs: number): Clock {
  return {
    kind: "every",
    times(from, to, limit) {
      const times: Date[] = [];
      let slot = slotAfter(intervalMs, from.getTime());
      while (slot <= to.getTime() && times.length < limit) {
        times.push(new Date(slot));
        slot += intervalMs;
      }
      return times;
    },
    newest(from, to) {
      const newest = slotAtOrBefore(intervalMs, to.getTime());
      return newest > from.getTime() ? new Date(newest) : null;
    },
  };
}

/**
 * The newest time the cron fires after `from` up to and including `to`, or
 * null. A cron has no step to count back by, so this first looks back from
 * `to` over a span that doubles until it holds a time, then halves the gap
 * between the newest time found and the end of the window until nothing fires
 * after it. Either way it takes a few dozen lookups, however long the window.
 */
function newestCronTime(cron: Cron, timeZone: string, from: Date, to: Date): Date | null {
  const firstAfter = (after: number): Date | null => {
    const next = nextCronTime(cron, new Date(after), timeZone);
    return next && next <= to ? next : null;
  };

  const start = from.getTime();
  const end = to.getTime();
  let span = MINUTE;
  let lookBack = Math.max(start, end - span);
  let newest = firstAfter(lookBack);
  while (!newest && lookBack > start) {
    span *= 2;
    lookBack = Math.max(start, end - span);
    newest = firstAfter(lookBack);
  }
  if (!newest) return null;

  // Nothing fires after `quietFrom` up to `end`.
  let quietFrom = end;
  for (;;) {
    const later = firstAfter(newest.getTime());
    if (!later) return newest;
    newest = later;
    const middle = newest.getTime() + Math.floor((quietFrom - newest.getTime()) / 2);
    const afterMiddle = firstAfter(middle);
    if (afterMiddle) newest = afterMiddle;
    else quietFrom = middle;
  }
}
