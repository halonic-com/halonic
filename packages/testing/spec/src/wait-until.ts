/** How long `waitUntil` keeps trying when nothing says otherwise, in milliseconds (under the 5 000 of a test). */
const fallbackTimeoutMs = 4_000;

/** How much shorter than the test's own timeout `waitUntil` gives up, so its message is the one that shows. */
const marginMs = 1_000;

/**
 * The default deadline: just under `HALONIC_TEST_TIMEOUT` when CI sets it
 * (30 s on loaded jobs), 4 000 ms otherwise. It reads the variable through
 * `globalThis.process`, because the Cloudflare test shim has no `process`.
 */
const defaultTimeout = (): number => {
  const requested = Number(globalThis.process?.env?.["HALONIC_TEST_TIMEOUT"]);
  return Number.isInteger(requested) && requested > marginMs
    ? requested - marginMs
    : fallbackTimeoutMs;
};

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
 * @param options - `timeout` in milliseconds; by default just under `HALONIC_TEST_TIMEOUT` when set, else 4 000
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
  const timeout = options.timeout ?? defaultTimeout();
  const deadline = Date.now() + timeout;
  while (!(await ready())) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeout} ms waiting for ${waitingFor}.`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
};
