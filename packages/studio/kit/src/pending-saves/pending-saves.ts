const pending = new Set<Promise<unknown>>();

/**
 * Tells the window it has a save under way, so closing the window waits for it. A field that saves
 * when it is left wraps the promise of that save: `onBlur={() => void settleOnClose(save())}`.
 *
 * @returns `save`, so the call site can still await it or chain on it
 */
export function settleOnClose<T>(save: Promise<T>): Promise<T> {
  pending.add(save);
  const done = () => pending.delete(save);
  save.then(done, done);
  return save;
}

/**
 * Waits for every save {@link settleOnClose} has been given, including ones begun while it waits.
 * A save that fails doesn't stop the wait: the field shows its own error.
 */
export async function settlePendingSaves(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
