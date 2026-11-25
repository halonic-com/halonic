// A stored last tick ahead of the clock, apart from the scheduler so its
// file stays small: when the clock was set back, a tick stores its own time.

import type { Coordination } from "@halonicjs/ports";

/**
 * How far ahead of the clock the stored last tick may be before the
 * scheduler counts the clock as set back. Hosts that tick one workspace
 * differ by seconds; a tick that far ahead was stored under a wrong clock.
 */
export const clockSetBackMs = 10 * 60 * 1000;

/**
 * Stores `now` as the last tick when the stored one is more than
 * {@link clockSetBackMs} ahead of it: the clock was set back, and
 * routines would otherwise wait, without a word, until it caught up. The
 * times up to the old last tick may come due again; the run ids keep a
 * time that already started from starting twice.
 */
export async function forgetTickAhead(
  coordination: Coordination,
  key: string,
  stored: string | null,
  lastTick: Date,
  now: Date,
): Promise<void> {
  if (lastTick.getTime() - now.getTime() <= clockSetBackMs) return;
  // A lost race means another instance stored its tick; its value stays.
  await coordination.compareAndSet(key, stored, now.toISOString());
}
