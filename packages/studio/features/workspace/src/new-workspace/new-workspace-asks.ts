/**
 * How a part of the app that lives outside the window, such as Home's finished sample card, asks
 * the window to open the New workspace dialog. The window listens; the app calls {@link ask}.
 *
 * @example
 * const asks = new NewWorkspaceAsks();
 * const stop = asks.subscribe(() => openDialog());
 * asks.ask(); // opens the dialog
 */
export class NewWorkspaceAsks {
  readonly #listeners = new Set<() => void>();

  /** Calls `listener` at every {@link ask}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Asks the window to open the New workspace dialog. */
  ask(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}
