import { assert } from "./assert.ts";
import type { Clock } from "./clock.ts";
import { bytesToHex } from "./hex.ts";

/** Makes new ids. Code that creates ids takes one, so tests can pass `fixedIds()`. */
export interface IdGenerator {
  /**
   * A new id that starts with `prefix` and an underscore.
   *
   * @param prefix - says what the id is for, such as `"run"`
   */
  next(prefix: string): string;
}

/**
 * Fills a new array with `byteCount` random bytes. The core has no access to
 * the platform's randomness, so the caller passes this in. On every target it
 * should be cryptographically secure, such as
 * `(n) => crypto.getRandomValues(new Uint8Array(n))`.
 */
export type RandomBytes = (byteCount: number) => Uint8Array;

/** How many random bytes `randomIds` puts in each id. */
const randomByteCount = 4;

/**
 * Ids made of a prefix, the time in base 36 and 4 random bytes in hex, such as
 * `run_mfx3k2a1_a1b2c3d4`. Ids made later sort later as long as the time keeps
 * the same number of digits (until the year 2059).
 *
 * @param randomBytes - where the random part comes from
 * @param clock - where the time part comes from
 * @returns the generator
 * @throws AssertionError from `next` when `randomBytes` returns the wrong number of bytes
 *
 * @example
 * const ids = randomIds((n) => crypto.getRandomValues(new Uint8Array(n)), systemClock);
 * ids.next("run"); // "run_mfx3k2a1_a1b2c3d4"
 */
export function randomIds(randomBytes: RandomBytes, clock: Clock): IdGenerator {
  return {
    next(prefix: string): string {
      const random = randomBytes(randomByteCount);
      assert(
        random.length === randomByteCount,
        `randomIds asked for ${randomByteCount} random bytes but got ${random.length}.`,
      );
      return `${prefix}_${clock.now().getTime().toString(36)}_${bytesToHex(random)}`;
    },
  };
}

/**
 * Ids for tests: each prefix counts up on its own from 1, so `run_1`, `run_2`
 * and `event_1` are the first three ids of a run.
 *
 * @returns a new generator whose counters all start at zero
 *
 * @example
 * const ids = fixedIds();
 * ids.next("run"); // "run_1"
 * ids.next("run"); // "run_2"
 * ids.next("event"); // "event_1"
 */
export function fixedIds(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix: string): string {
      const count = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, count);
      return `${prefix}_${count}`;
    },
  };
}
