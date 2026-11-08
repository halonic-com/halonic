import type { ScheduledTimer } from "@halonicjs/ports";

/**
 * A timer as the scheduler keeps it: the timer the listener gets, plus how
 * often it failed and when it is next delivered. A new object is made on
 * every change, so a delivery can tell by identity whether its timer was set
 * again or cancelled while the listener ran.
 */
export interface StoredTimer {
  readonly timer: ScheduledTimer;
  /** How many deliveries in a row the listener rejected. */
  readonly failures: number;
  /** When it is next delivered, in ms: the set time, or the retry time after a failure. */
  readonly dueAt: number;
}

/** A fresh timer, due at the time it was set for. */
export function freshTimer(key: string, timerId: string, at: string): StoredTimer {
  return { timer: { key, timerId, at }, failures: 0, dueAt: Date.parse(at) };
}

/** The same timer after one more failure, next delivered at `dueAt`. */
export function failedTimer(stored: StoredTimer, dueAt: number): StoredTimer {
  return { timer: stored.timer, failures: stored.failures + 1, dueAt };
}

/** One id per key and timer id; JSON keeps `a` + `b/c` apart from `a/b` + `c`. */
export function timerSlot(key: string, timerId: string): string {
  return JSON.stringify([key, timerId]);
}

/** The values of a timer's record in the record store. */
export function toRecordValues(stored: StoredTimer): Record<string, unknown> {
  return {
    key: stored.timer.key,
    timerId: stored.timer.timerId,
    at: stored.timer.at,
    failures: stored.failures,
    dueAt: new Date(stored.dueAt).toISOString(),
  };
}

/**
 * Reads a timer back from its record values.
 *
 * @throws Error naming the record when the values aren't a timer this scheduler wrote
 */
export function fromRecordValues(recordId: string, values: Record<string, unknown>): StoredTimer {
  const { key, timerId, at, failures, dueAt } = values;
  const dueAtMs = typeof dueAt === "string" ? Date.parse(dueAt) : Number.NaN;
  const isTimer =
    typeof key === "string" &&
    typeof timerId === "string" &&
    typeof at === "string" &&
    !Number.isNaN(Date.parse(at)) &&
    typeof failures === "number" &&
    Number.isSafeInteger(failures) &&
    failures >= 0 &&
    !Number.isNaN(dueAtMs);
  if (!isTimer) {
    throw new Error(
      `Scheduler record ${recordId} is not a timer: it needs a key, a timer id, a valid "at", a whole number of failures and a valid "dueAt".`,
    );
  }
  return { timer: { key, timerId, at }, failures, dueAt: dueAtMs };
}
