/**
 * Runs async work one at a time per key: work for a key starts only once
 * the work queued before it for the same key has settled. Work for different
 * keys runs side by side. A failure goes to its own caller and doesn't stop
 * the work queued after it.
 *
 * @example
 * const queue = new KeyedQueue();
 * void queue.run("run-1", () => appendToLog("a"));
 * void queue.run("run-1", () => appendToLog("b")); // starts after "a" is written
 */
export class KeyedQueue {
  /** The last work queued for each key, settled or not. A key is left out once its work is done. */
  readonly #lastWork = new Map<string, Promise<void>>();

  /** Queues `work` for `key` and gives what it returns or throws. */
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (this.#lastWork.get(key) ?? Promise.resolve()).then(work);
    const settled = result.then(ignore, ignore);
    this.#lastWork.set(key, settled);
    void settled.then(() => {
      if (this.#lastWork.get(key) === settled) {
        this.#lastWork.delete(key);
      }
    });
    return result;
  }

  /** How many keys have work queued or running. */
  get busyKeys(): number {
    return this.#lastWork.size;
  }
}

function ignore(): void {}
