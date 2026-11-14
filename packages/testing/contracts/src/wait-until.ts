import { vi } from "vitest";

/**
 * Waits until `ready` says yes, checking every 10 ms.
 *
 * Use it instead of `vi.waitFor(() => expect(...))`: that makes one more
 * `expect` call for every try, so a requirement's `expect` count (which the
 * requirement guard compares with the base commit's) changes with how long
 * the wait took. Wait with this, then `expect` once.
 *
 * @param ready - the check; it must not call `expect`
 * @param timeoutMs - how long to wait before giving up
 */
export const waitUntil = async (ready: () => boolean, timeoutMs = 1000): Promise<void> => {
  await vi.waitUntil(ready, { timeout: timeoutMs, interval: 10 });
};
