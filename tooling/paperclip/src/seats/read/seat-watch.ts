/**
 * What `seats.read` remembers about each seat between reads: when to read it
 * next, its last good reading and its sign-in. From that come the back-off
 * after a rate limit, the age of the reading shown on the page and the alerts.
 * No I/O: the job hands in each read's outcome and the time.
 */

import type { SignInStatus } from "../auth-status.ts";
import { nextReadAt } from "../read-schedule.ts";
import type { ReadError, SeatId } from "../records.ts";
import { bucketMs } from "../usage-buckets.ts";
import type { SeatReadOutcome } from "./read-seat.ts";

export interface SeatWatch {
  readonly seatId: SeatId;
  /** The seat's read offset inside each 10-minute bucket (`readOffsetMs`). */
  readonly offsetMs: number;
  /** When the plugin started watching the seat. */
  readonly since: string;
  readonly nextReadAt: string;
  readonly lastReadAt: string | undefined;
  readonly lastGoodAt: string | undefined;
  readonly lastError: ReadError | undefined;
  readonly rateLimitedInARow: number;
  /** The last sign-in read; kept when a later read couldn't get one. */
  readonly signIn: SignInStatus | undefined;
}

export type SeatAlertKind =
  | "signed-out"
  | "not-subscription"
  | "other-account"
  | "sign-in-expired"
  | "sign-in-expiring"
  | "readings-stopped";

export interface SeatAlert {
  readonly seatId: SeatId;
  readonly kind: SeatAlertKind;
}

/** Back-off after rate limits in a row: 20, 40, then at most 60 minutes. */
const maxBackoffBuckets = 6;
/** Readings count as stopped after three missed reads. */
export const stoppedAfterMs = 3 * bucketMs;
/** A sign-in that expires within a day is flagged, so the board can renew it in time. */
export const expiringWithinMs = 24 * 60 * 60_000;

export function startWatch(seatId: SeatId, offsetMs: number, now: string): SeatWatch {
  return {
    seatId,
    offsetMs,
    since: now,
    nextReadAt: nextReadAt(now, offsetMs),
    lastReadAt: undefined,
    lastGoodAt: undefined,
    lastError: undefined,
    rateLimitedInARow: 0,
    signIn: undefined,
  };
}

export function isDue(watch: SeatWatch, now: string): boolean {
  return Date.parse(watch.nextReadAt) <= Date.parse(now);
}

/**
 * The watch after one read. A rate limit pushes the next read back by whole
 * buckets, doubling each time; the seat keeps its offset, so its readings
 * still pair with whole usage buckets.
 */
export function afterRead(watch: SeatWatch, outcome: SeatReadOutcome): SeatWatch {
  const { reading } = outcome;
  const rateLimitedInARow = reading.error === "rate-limited" ? watch.rateLimitedInARow + 1 : 0;
  const waitBuckets = Math.min(2 ** rateLimitedInARow, maxBackoffBuckets);
  const from = new Date(Date.parse(reading.at) + (waitBuckets - 1) * bucketMs).toISOString();
  return {
    ...watch,
    nextReadAt: nextReadAt(from, watch.offsetMs),
    lastReadAt: reading.at,
    lastGoodAt: reading.error === undefined ? reading.at : watch.lastGoodAt,
    lastError: reading.error,
    rateLimitedInARow,
    signIn: outcome.signIn ?? watch.signIn,
  };
}

/** How old the seat's last good reading is, in ms; undefined before the first one. */
export function readingAgeMs(watch: SeatWatch, now: string): number | undefined {
  return watch.lastGoodAt === undefined
    ? undefined
    : Date.parse(now) - Date.parse(watch.lastGoodAt);
}

/** What the board should know about the seat now. */
export function seatAlerts(watch: SeatWatch, now: string): SeatAlert[] {
  const kinds: SeatAlertKind[] = [];
  const signIn = watch.signIn;
  if (signIn?.state === "signed-out") {
    kinds.push("signed-out");
  } else if (signIn?.state === "not-subscription") {
    kinds.push("not-subscription");
  }
  if (signIn?.account === "differs") {
    kinds.push("other-account");
  }
  const expiry = signIn?.state === "signed-in" ? signIn.expiresAt : undefined;
  if (expiry !== undefined) {
    const left = Date.parse(expiry) - Date.parse(now);
    if (left <= 0) {
      kinds.push("sign-in-expired");
    } else if (left <= expiringWithinMs) {
      kinds.push("sign-in-expiring");
    }
  }
  const goodSince = watch.lastGoodAt ?? watch.since;
  if (Date.parse(now) - Date.parse(goodSince) > stoppedAfterMs) {
    kinds.push("readings-stopped");
  }
  return kinds.map((kind) => ({ seatId: watch.seatId, kind }));
}
