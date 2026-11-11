import { vi } from "vitest";

/**
 * Waits until `ready` says yes, trying again on `vi.waitFor`'s interval.
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
  await vi.waitFor(async () => {
    if (!(await ready())) throw new Error("Not ready yet.");
  }, options);
}
