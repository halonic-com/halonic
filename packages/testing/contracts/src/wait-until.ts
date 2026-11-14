/**
 * Waits until `ready` says yes, checking every 10 ms like `vi.waitFor` does.
 *
 * Use it instead of `vi.waitFor(() => expect(...))`: that makes one more
 * `expect` call for every try, so a requirement's `expect` count (which the
 * requirement guard compares with the base commit's) changes with how long
 * the wait took. Wait with this, then `expect` once.
 *
 * It has no timeout of its own: the test's timeout ends a wait that never
 * passes. It uses no `vi` helper because the Cloudflare test shim lacks them.
 *
 * @param ready - the check; it must not call `expect`
 */
export const waitUntil = async (ready: () => boolean): Promise<void> => {
  while (!ready()) await new Promise<void>((resolve) => setTimeout(resolve, 10));
};
