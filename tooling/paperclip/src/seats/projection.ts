/**
 * How fast a seat uses up one limit window, and whether it runs out before
 * the window resets. Worked out from the seat's saved readings only, so the
 * placement rules and the page share one answer.
 */

/** One saved reading of one window of one seat. */
export interface WindowSample {
  /** When it was read, as an ISO time. */
  readonly at: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
}

/** Where one window is heading. */
export interface Projection {
  /** Percent used now: 0 once the newest reading's reset has passed. */
  readonly usedPercent: number;
  /** Percent per hour since the window's last reset; `undefined` without enough readings. */
  readonly percentPerHour: number | undefined;
  /** When it reaches 100% at that rate, as an ISO time, if it does before it resets. */
  readonly fullAt: string | undefined;
}

const hourMs = 3_600_000;
/** Two readings this close together say too little about a rate. */
export const shortestSpanMs = 30 * 60_000;
/** Resets this close together are the same window: Claude Code prints them to the minute. */
const sameWindowMs = hourMs;

function sameWindow(a: WindowSample, b: WindowSample): boolean {
  if (a.resetsAt === undefined || b.resetsAt === undefined) {
    return a.resetsAt === b.resetsAt;
  }
  return Math.abs(Date.parse(a.resetsAt) - Date.parse(b.resetsAt)) < sameWindowMs;
}

/**
 * The newest run of readings in one window, oldest first: it stops at a
 * reset, or where the percentage went down (a reset the readings missed).
 */
export function currentWindow(samples: readonly WindowSample[]): WindowSample[] {
  const sorted = [...samples].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const newest = sorted.at(-1);
  if (newest === undefined) {
    return [];
  }
  const run = [newest];
  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const earlier = sorted[index];
    const later = run[0];
    if (earlier === undefined || later === undefined) {
      break;
    }
    if (!sameWindow(earlier, later) || earlier.usedPercent > later.usedPercent) {
      break;
    }
    run.unshift(earlier);
  }
  return run;
}

function rateOf(run: readonly WindowSample[]): number | undefined {
  const first = run[0];
  const last = run.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const spanMs = Date.parse(last.at) - Date.parse(first.at);
  if (spanMs < shortestSpanMs) {
    return undefined;
  }
  return ((last.usedPercent - first.usedPercent) * hourMs) / spanMs;
}

/**
 * Where one window of one seat is heading at `now` (ISO). A window whose
 * reset has passed counts as unused again, with no rate until new readings
 * come in.
 */
export function project(samples: readonly WindowSample[], now: string): Projection {
  const run = currentWindow(samples);
  const newest = run.at(-1);
  if (newest === undefined) {
    return { usedPercent: 0, percentPerHour: undefined, fullAt: undefined };
  }
  const nowMs = Date.parse(now);
  const resetMs = newest.resetsAt === undefined ? undefined : Date.parse(newest.resetsAt);
  if (resetMs !== undefined && resetMs <= nowMs) {
    return { usedPercent: 0, percentPerHour: undefined, fullAt: undefined };
  }
  const percentPerHour = rateOf(run);
  if (newest.usedPercent >= 100) {
    return { usedPercent: newest.usedPercent, percentPerHour, fullAt: newest.at };
  }
  if (percentPerHour === undefined || percentPerHour <= 0) {
    return { usedPercent: newest.usedPercent, percentPerHour, fullAt: undefined };
  }
  const fullMs = Date.parse(newest.at) + ((100 - newest.usedPercent) / percentPerHour) * hourMs;
  const beforeReset = resetMs === undefined || fullMs < resetMs;
  return {
    usedPercent: newest.usedPercent,
    percentPerHour,
    fullAt: beforeReset ? new Date(fullMs).toISOString() : undefined,
  };
}
