/**
 * The first error in `error`'s chain of causes, `error` itself included,
 * that is an instance of `type`, or `undefined` when none is. A chain that
 * loops back on itself ends at the first error seen twice.
 *
 * @example
 * findCause(new Error("didn't start", { cause: new RangeError("bad") }), RangeError) // the RangeError
 */
export function findCause<T extends Error>(
  error: unknown,
  type: abstract new (...args: never[]) => T,
): T | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    if (current instanceof type) return current;
    seen.add(current);
    current = current.cause;
  }
  return undefined;
}
