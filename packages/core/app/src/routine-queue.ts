// The stored queue of the routine scheduler (`overlap: queue`): how it is
// written to and read from one `Coordination` value, and summed up per routine.

import { utf8Length } from "./routine-ids.ts";
import type { OverlapDecision } from "./routine-overlap.ts";

/** A due time as the queue keeps it: the routine key and the due time. */
interface QueuedRun {
  key: string;
  at: Date;
}

/** A routine's queued due times, as the last tick stored them. */
export interface QueuedTimes {
  /** The routine key. */
  key: string;
  /** How many times are waiting, at most 100. */
  count: number;
  /** ISO time of the oldest queued time. */
  first: string;
  /** ISO time of the newest queued time. */
  last: string;
}

/** The most UTF-8 bytes of the stored queue: under the 64 KiB a `Coordination` value may hold. */
const maxQueueBytes = 60_000;

/** The least one queued time adds to the stored queue: an ISO time in quotes, and a comma. */
const minQueuedTimeBytes = 27;

/**
 * Moves the newest queued runs to the skipped ones until the stored queue
 * fits in a `Coordination` value, so a long queue can never make the ticks
 * fail. Takes a queue sorted oldest first.
 */
export function fitQueue<Run extends QueuedRun>(plan: OverlapDecision<Run>): void {
  let excess = utf8Length(writeQueue(plan.queue) ?? "") - maxQueueBytes;
  while (excess > 0) {
    const dropped = plan.queue.splice(-Math.ceil(excess / minQueuedTimeBytes));
    plan.skip.push(...dropped);
    excess = utf8Length(writeQueue(plan.queue) ?? "") - maxQueueBytes;
  }
}

/**
 * The queue as kept in `Coordination`: JSON of routine key to ISO due times,
 * or `null` when nothing is queued.
 */
export function writeQueue(runs: readonly QueuedRun[]): string | null {
  if (runs.length === 0) {
    return null;
  }
  const queue: Record<string, string[]> = {};
  for (const run of runs) {
    queue[run.key] = [...(queue[run.key] ?? []), run.at.toISOString()];
  }
  return JSON.stringify(queue);
}

/**
 * Reads what {@link writeQueue} wrote, or `null` when it can't be read. Only
 * the scheduler writes the key, so anything else (a hand edit, a damaged
 * store) counts as no queue rather than stopping every routine of the
 * workspace; the caller notes the loss.
 */
export function readQueue(text: string | null): Map<string, Date[]> | null {
  const queue = new Map<string, Date[]>();
  if (text === null) {
    return queue;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  for (const [key, times] of Object.entries(parsed)) {
    if (!Array.isArray(times)) {
      continue;
    }
    const dates = times
      .filter((time): time is string => typeof time === "string")
      .map((time) => new Date(time))
      .filter((date) => !Number.isNaN(date.getTime()));
    queue.set(key, dates);
  }
  return queue;
}

/** Each routine's count, oldest and newest time in a queue {@link readQueue} read, by key; routines without times are left out. */
export function summarizeQueue(queue: ReadonlyMap<string, readonly Date[]>): QueuedTimes[] {
  const summary: QueuedTimes[] = [];
  for (const [key, times] of queue) {
    const millis = times.map((time) => time.getTime());
    if (millis.length === 0) {
      continue;
    }
    summary.push({
      key,
      count: millis.length,
      first: new Date(Math.min(...millis)).toISOString(),
      last: new Date(Math.max(...millis)).toISOString(),
    });
  }
  return summary.sort((a, b) => (a.key < b.key ? -1 : Number(a.key > b.key)));
}
