/**
 * How a part of the app that lives outside the window, such as the first run's **Help › First run
 * › Start over**, asks the window for a fresh copy of the demo: the same copy the demo chip's
 * **Fresh copy of the demo** makes, in the next free folder, opened once it is written. The window
 * listens; the app calls {@link ask}, and is told once the copy is written, before it opens.
 *
 * @example
 * const asks = new FreshCopyAsks();
 * const stop = asks.subscribe((onCopied) => void copyFresh(onCopied));
 * asks.ask(() => console.log("written")); // copies the demo again
 */
export class FreshCopyAsks {
  readonly #listeners = new Set<(onCopied?: () => void) => void>();

  /** Calls `listener` at every {@link ask}, with the ask's `onCopied`. Returns a function that stops the calls. */
  subscribe(listener: (onCopied?: () => void) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Asks the window for a fresh copy of the demo. `onCopied` runs once the copy is written (made
   * now, or found there already), before it opens; never when it can't be written. It runs at most
   * once per ask, however many times **Try again** is pressed.
   */
  ask(onCopied?: () => void): void {
    const once = onCopied === undefined ? undefined : onceOnly(onCopied);
    for (const listener of [...this.#listeners]) listener(once);
  }
}

/** `action`, run on the first call only. */
function onceOnly(action: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    action();
  };
}
