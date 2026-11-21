/**
 * How a part of the app that lives outside the window, such as the first run's **Help › First run
 * › Start over**, asks the window for a fresh copy of the demo: the same copy the demo chip's
 * **Fresh copy of the demo** makes, in the next free folder, opened once it is written. The window
 * listens; the app calls {@link ask}.
 *
 * @example
 * const asks = new FreshCopyAsks();
 * const stop = asks.subscribe(() => void copyFresh());
 * asks.ask(); // copies the demo again
 */
export class FreshCopyAsks {
  readonly #listeners = new Set<() => void>();

  /** Calls `listener` at every {@link ask}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Asks the window for a fresh copy of the demo. */
  ask(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}
