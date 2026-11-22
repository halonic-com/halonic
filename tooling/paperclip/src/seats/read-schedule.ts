/**
 * When `seats.read` reads each seat. Reads are spread across the 10-minute
 * bucket so the seats aren't all read at once, and each seat keeps the same
 * offset in every bucket: then the span between two of its readings always
 * covers whole buckets, which the forecast needs to pair readings with usage.
 */

import type { SeatId } from "./records.ts";
import { bucketMs } from "./usage-buckets.ts";

const minuteMs = 60_000;
/** Offsets run from minute 1 to minute 8, clear of the bucket's edges. */
const offsetSlots = 8;

/**
 * The seat's read offset inside a bucket, in ms. It depends only on the
 * seat's place in the board's seat list, so adding a seat at the end moves
 * no other seat. From the ninth seat on, seats share an offset.
 */
export function readOffsetMs(seatIds: readonly SeatId[], seatId: SeatId): number | undefined {
  const index = seatIds.indexOf(seatId);
  if (index < 0) {
    return undefined;
  }
  return (1 + (index % offsetSlots)) * minuteMs;
}

/** The first time after `now` (ISO) that a seat with this offset is read, as an ISO time. */
export function nextReadAt(now: string, offsetMs: number): string {
  const nowMs = Date.parse(now);
  const thisBucket = nowMs - (nowMs % bucketMs);
  const due = thisBucket + offsetMs;
  return new Date(due > nowMs ? due : due + bucketMs).toISOString();
}
