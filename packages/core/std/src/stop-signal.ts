/**
 * Tells work that it should stop, and why. It does what an `AbortSignal`
 * does for code that can't create one: core packages see the Web types but
 * not their values, so they have no `AbortController`.
 */
export interface StopSignal {
  /** Whether the work was told to stop. */
  readonly stopped: boolean;
  /** Why it was told to stop; `undefined` until then. */
  readonly reason: Error | undefined;
  /** @throws the reason, once the work was told to stop */
  throwIfStopped(): void;
  /**
   * Calls `listener` once, when the work is told to stop, or soon after this
   * returns when it already was. Returns a function that removes it.
   */
  onStop(listener: () => void): () => void;
}

/**
 * Gives out a {@link StopSignal} and tells it to stop.
 *
 * @example
 * const source = new StopSource();
 * void runHarness(source.signal);
 * source.stop(new Error("The engine stopped."));
 */
export class StopSource {
  readonly signal: StopSignal;
  #reason: Error | undefined;
  readonly #listeners = new Set<() => void>();

  constructor() {
    const source = this;
    this.signal = {
      get stopped() {
        return source.#reason !== undefined;
      },
      get reason() {
        return source.#reason;
      },
      throwIfStopped() {
        if (source.#reason !== undefined) throw source.#reason;
      },
      onStop: (listener) => this.#onStop(listener),
    };
  }

  /**
   * Tells the signal to stop with `reason`, and each listener once. A second
   * call changes nothing.
   *
   * @throws the error of the one listener that threw, or an `AggregateError`
   * when several did; the other listeners still run
   */
  stop(reason: Error): void {
    if (this.#reason !== undefined) return;
    this.#reason = reason;
    this.#callListeners();
  }

  #onStop(listener: () => void): () => void {
    // Wrapped, so adding the same function twice gives two independent listeners.
    const entry = () => listener();
    this.#listeners.add(entry);
    if (this.#reason !== undefined) {
      // Called later rather than now, so the caller has its remove function
      // first. A listener that throws here is an unhandled rejection.
      void Promise.resolve().then(() => this.#callListeners());
    }
    return () => {
      this.#listeners.delete(entry);
    };
  }

  /** Calls and removes every listener, like `Emitter.emit` does with errors. */
  #callListeners(): void {
    const listeners = [...this.#listeners];
    this.#listeners.clear();
    const errors: unknown[] = [];
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} stop listeners failed.`);
    }
  }
}
