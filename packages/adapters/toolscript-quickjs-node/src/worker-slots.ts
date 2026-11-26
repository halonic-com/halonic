/** Gives a slot back. Safe to call twice. */
export type ReleaseSlot = () => void;

/**
 * At most `size` workers at once; the rest wait in order. The runner shares
 * its processes and threads with everyone, so `serve` must not start a
 * thread for every run in parallel (Liam, HAL-18669).
 */
export class WorkerSlots {
  readonly #size: number;
  #inUse = 0;
  readonly #waiting: (() => void)[] = [];

  /** @throws RangeError when `size` isn't a whole number of at least 1 */
  constructor(size: number) {
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError(`A worker limit is a whole number of at least 1, not ${size}.`);
    }
    this.#size = size;
  }

  /** How many runs wait for a slot. */
  get waiting(): number {
    return this.#waiting.length;
  }

  /**
   * Waits for a free slot. Resolves to `undefined`, without taking one, when
   * `signal` aborts first: a cancelled run leaves the queue and never starts.
   */
  async take(signal?: AbortSignal): Promise<ReleaseSlot | undefined> {
    if (signal?.aborted) return undefined;
    if (this.#inUse < this.#size) return this.#taken();
    return new Promise((resolve) => {
      const turn = () => {
        signal?.removeEventListener("abort", leave);
        resolve(this.#taken());
      };
      const leave = () => {
        this.#waiting.splice(this.#waiting.indexOf(turn), 1);
        resolve(undefined);
      };
      this.#waiting.push(turn);
      signal?.addEventListener("abort", leave, { once: true });
    });
  }

  #taken(): ReleaseSlot {
    this.#inUse += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#inUse -= 1;
      this.#waiting.shift()?.();
    };
  }
}
