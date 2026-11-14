/**
 * Waits until `ready` says yes, checking every 10 ms like `vi.waitFor` does.
 *
 * Use it instead of `vi.waitFor(() => expect(...))`: that makes one more
 * `expect` call for every try, so a requirement's `expect` count (which the
 * requirement guard compares with the base commit's) changes with how long
 * the wait took. Wait with this, then `expect` once.
 *
 * @param ready - the check; it must not call `expect`
 * @param timeoutMs - how long to wait before giving up
 */
export async function waitUntil(ready: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the check to pass.");
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
  }
}
