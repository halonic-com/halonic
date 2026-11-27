/**
 * Whether one open workspace's engine is still starting: the workspace shows from its files while
 * the shell opens its engine (HAL-19965). It belongs to the workspace, not to the window's
 * `ShellEngine`, so opening a second folder never says the first one's engine stopped answering.
 * Nothing is announced; the frame's engine line says "Starting the engine…" while it starts.
 */
export class EngineStarting {
  #starting: boolean;
  readonly #listeners = new Set<() => void>();

  /**
   * @param ready the open of the workspace's engine; it is starting until that settles, whether
   *   it succeeded or failed. Left out, the engine isn't starting.
   */
  constructor(ready?: Promise<unknown>) {
    this.#starting = ready !== undefined;
    const settle = (): void => {
      this.#starting = false;
      for (const listener of [...this.#listeners]) listener();
    };
    ready?.then(settle, settle);
  }

  /** Whether the engine is still starting. */
  get starting(): boolean {
    return this.#starting;
  }

  /** Calls `listener` once, when the engine has started. Returns a function that stops listening. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
