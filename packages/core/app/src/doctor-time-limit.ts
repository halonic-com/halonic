// The time limit on each check of `halonic doctor` (first-run-progress 7,
// HAL-13405): a check that hasn't answered after 5 seconds ends as a warning,
// so one that hangs, such as a `detect()` that never returns, doesn't hold up
// the other lines.

import type { DoctorLine } from "./doctor-checks.ts";
import type { SaveTimers } from "./save-scheduler.ts";

/**
 * How long `doctor` waits for one check: 5 seconds. A target until it has
 * been measured on a slow computer (first-run-progress 7, task 12).
 */
export const doctorCheckLimitMs = 5_000;

/** The checks a time limit can end, by the `check` of their line. */
export type LimitedCheck =
  | "workspace"
  | "models"
  | "secrets"
  | "sandbox"
  | "harnesses"
  | "node"
  | "disk";

/** The line of a check that didn't answer within {@link doctorCheckLimitMs}: "didn't answer in 5 seconds". */
export interface TimedOutLine<Check extends LimitedCheck = LimitedCheck> extends DoctorLine {
  check: Check;
  /** A warning: `doctor` didn't find a problem, it just couldn't tell. */
  status: "warning";
  timedOut: true;
}

/** What {@link withinLimit} gives for a check that ran over. */
export const timedOut: unique symbol = Symbol("timed out");

/**
 * The line for `check` when it ran over the limit.
 *
 * @example
 * timedOutLine("sandbox"); // { check: "sandbox", status: "warning", timedOut: true }
 */
export function timedOutLine<Check extends LimitedCheck>(check: Check): TimedOutLine<Check> {
  return { check, status: "warning", timedOut: true };
}

/**
 * What `check` found, or {@link timedOut} when it hasn't answered after
 * {@link doctorCheckLimitMs}. A check that runs over is left to finish on
 * its own, and what it throws then is dropped: its line is already the
 * warning. One that throws in time throws here.
 *
 * @param timers the clock the limit runs on: `setTimeout` and `clearTimeout`, or a test's own
 *
 * @example
 * const found = await withinLimit(timers, sandbox.check());
 * const line = found === timedOut ? timedOutLine("sandbox") : sandboxLine(found, capabilities);
 */
export async function withinLimit<T>(
  timers: SaveTimers,
  check: Promise<T>,
): Promise<T | typeof timedOut> {
  let timer: unknown;
  const limit = new Promise<typeof timedOut>((resolve) => {
    timer = timers.set(() => resolve(timedOut), doctorCheckLimitMs);
  });
  check.catch(() => undefined); // past the limit, what it throws has no line to go to
  try {
    return await Promise.race([check, limit]);
  } finally {
    timers.clear(timer);
  }
}

/**
 * The line `line` makes of what a check found, or its {@link TimedOutLine}
 * when it ran over.
 *
 * @example
 * lineOf(await withinLimit(timers, sandbox.check()), "sandbox", (found) => sandboxLine(found, capabilities));
 */
export function lineOf<Found, Line, Check extends LimitedCheck>(
  found: Found | typeof timedOut,
  check: Check,
  line: (found: Found) => Line,
): Line | TimedOutLine<Check> {
  return found === timedOut ? timedOutLine(check) : line(found);
}
