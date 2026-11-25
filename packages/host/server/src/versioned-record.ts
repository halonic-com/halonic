import type { Coordination } from "@halonicjs/ports";

/** How often {@link updateRecord} reads again after another writer changed the value first. */
const maxTries = 8;

/**
 * Changes one `Coordination` value by compare-and-set: reads it, lets `next` work out the new
 * text, and writes it only if nobody changed it in between; otherwise reads again. `next` gives
 * `undefined` to leave the value as it is, and may run more than once. Takes no lock.
 *
 * @throws Error when the value kept changing under it {@link maxTries} times
 */
export async function updateRecord(
  coordination: Coordination,
  key: string,
  next: (stored: string | null) => string | undefined,
): Promise<void> {
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const stored = await coordination.read(key);
    const changed = next(stored);
    if (changed === undefined || (await coordination.compareAndSet(key, stored, changed))) {
      return;
    }
  }
  throw new Error(`the value under ${key} kept changing; gave up after ${maxTries} tries`);
}
