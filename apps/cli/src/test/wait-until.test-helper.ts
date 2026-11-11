import { setTimeout as sleep } from "node:timers/promises";

/**
 * Waits until `ready` says yes, checking every 50 ms like `vi.waitFor`.
 *
 * Use it instead of `vi.waitFor(() => expect(...))`: that makes one more
 * `expect` call for every try, so a test's `expect` count (which the
 * requirement guard compares with the base commit's) changes with how long
 * the wait took. Wait with this, then `expect` once.
 *
 * @param ready - the check; it may start something each try
 * @param options - `timeout` in milliseconds, as for `vi.waitFor`
 */
export async function waitUntil(
  ready: () => boolean | Promise<boolean>,
  options: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeout ?? 1000);
  while (!(await ready())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the check to pass.");
    await sleep(50);
  }
}
