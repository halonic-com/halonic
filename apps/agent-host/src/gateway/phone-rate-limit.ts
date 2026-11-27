import type { GatewayRateLimit, GatewayRateLimited } from "@halonicjs/adapter-remote-gateway";
import type { Clock } from "@halonicjs/ports";
import { deviceId } from "../remote/phone-records.ts";

/**
 * How many searches, sends and reactions reads one paired phone may make in
 * a minute (proposed on HAL-18874 and HAL-20260 for Julian's sign-off;
 * HAL-17540 asks for a rate but names no number). A person reading and
 * replying stays well under it; a stolen phone can't turn the board key into
 * a burst of Paperclip calls. Reactions reads get more, because the phone
 * reads them each time a chat opens or changes, and one refused only hides
 * the chat's reactions.
 */
export const phoneCallsPerMinute: Readonly<Record<GatewayRateLimited, number>> = {
  search: 10,
  send: 10,
  reactions: 30,
};

const minuteMs = 60_000;

/** One kind of call's bucket: how many calls are left, as of when. */
interface Bucket {
  left: number;
  atMs: number;
}

/**
 * The paired phones' rates for search, send and reactions reads (Julian,
 * HAL-17540): a token bucket per phone and kind, which refills evenly over a
 * minute. Buckets are keyed by the paired phone's id, never by its
 * connection, so a phone that reconnects finds its bucket as it left it. It
 * reads the time from the `Clock` port and sets no timer: a bucket refills by
 * the time that passed since its last call. It holds a small entry per phone
 * and kind it ever rated, for as long as the host runs.
 */
export class PhoneRateLimits {
  readonly #clock: Clock;
  readonly #buckets = new Map<string, Bucket>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** The rate of the paired phone with this static key. */
  forPhone(phoneKey: Uint8Array): GatewayRateLimit {
    const phoneId = deviceId(phoneKey);
    return { take: (kind) => this.#take(`${phoneId}/${kind}`, phoneCallsPerMinute[kind]) };
  }

  #take(key: string, perMinute: number): boolean {
    const nowMs = this.#clock.now().getTime();
    const bucket = this.#buckets.get(key) ?? { left: perMinute, atMs: nowMs };
    const refilled = ((nowMs - bucket.atMs) / minuteMs) * perMinute;
    // A clock that went back refills nothing.
    const left = Math.min(perMinute, bucket.left + Math.max(0, refilled));
    // A refused call changes nothing: the bucket goes on refilling from its last call.
    if (left < 1) return false;
    this.#buckets.set(key, { left: left - 1, atMs: nowMs });
    return true;
  }
}
