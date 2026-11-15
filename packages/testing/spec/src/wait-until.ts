/** How long `waitUntil` keeps trying when the test gives no `timeout`, in milliseconds. */
const defaultTimeoutMs = 4_000;

/** How long `waitUntil` pauses between two tries, in milliseconds. */
const pollIntervalMs = 10;

/**
 * Waits until `ready` says yes, then lets the test check the result once.
 *
 * Use it instead of `vi.waitFor(() => expect(...))`: that makes one more
 * `expect` call for every try, so a requirement's `expect` count (which the
 * requirement guard compares with the base commit's) changes with how long
 * the wait took. Wait with this, then `expect` once.
 *
 * It uses no `vi` helper, because the Cloudflare test shim lacks them, and it
 * reads the clock through the global timers, so fake timers drive it.
 *
 * @param waitingFor - what the test waits for, as a noun phrase; the timeout error repeats it
 * @param ready - the check; it must not call `expect`, and it may start something each try
 * @param options - `timeout` in milliseconds, 4 000 by default (below the 5 000 of a test)
 * @throws when `ready` is still false after the timeout
 *
 * @example
 * await waitUntil("the listener to be called", () => listener.mock.calls.length > 0);
 * expect(listener).toHaveBeenCalledOnce();
 */
export const waitUntil = async (
  waitingFor: string,
  ready: () => boolean | Promise<boolean>,
  options: { timeout?: number } = {},
): Promise<void> => {
  const timeout = options.timeout ?? defaultTimeoutMs;
  const deadline = Date.now() + timeout;
  while (!(await ready())) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeout} ms waiting for ${waitingFor}.`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
};
