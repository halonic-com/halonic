/**
 * Counts the CPU time a run spends inside the isolate: evaluating the
 * script, calling into it and running its jobs. Time spent waiting on a
 * host function isn't counted (ADR 2.3). QuickJS asks {@link shouldInterrupt}
 * every few thousand instructions; it says yes once the limit is passed or
 * the run has ended, so a busy loop stops there.
 */
export class CpuMeter {
  readonly #limitMs: number;
  readonly #now: () => number;
  #usedMs = 0;
  #enteredAt: number | undefined;
  #tripped = false;
  #stopped = false;

  /**
   * @param limitMs - the run's `cpuMs`
   * @param now - the clock in milliseconds; `Date.now`, the clock every runtime has
   */
  constructor(limitMs: number, now: () => number = Date.now) {
    this.#limitMs = limitMs;
    this.#now = now;
  }

  /** Whether the CPU limit stopped the run. */
  get tripped(): boolean {
    return this.#tripped;
  }

  /** Runs `work` inside the isolate and counts its time. */
  inside<T>(work: () => T): T {
    this.#enteredAt = this.#now();
    try {
      return work();
    } finally {
      this.#usedMs += this.#now() - this.#enteredAt;
      this.#enteredAt = undefined;
    }
  }

  /** From now on every check interrupts: the run has ended for another reason. */
  stop(): void {
    this.#stopped = true;
  }

  /** The interrupt handler: `true` stops the code running in the isolate. */
  readonly shouldInterrupt = (): boolean => {
    if (this.#stopped) return true;
    if (this.#enteredAt === undefined) return false;
    if (this.#usedMs + this.#now() - this.#enteredAt <= this.#limitMs) return false;
    this.#tripped = true;
    return true;
  };
}
