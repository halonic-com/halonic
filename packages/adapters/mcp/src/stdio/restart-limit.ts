import type { Clock } from "@halonicjs/std";

/** How often a connector may start its program again after it stopped. */
export interface RestartLimits {
  /** How many restarts are allowed within `windowMs`. */
  readonly maxRestarts: number;
  readonly windowMs: number;
}

/** At most 3 restarts within 10 minutes (HAL-4564). */
export const defaultRestartLimits: RestartLimits = { maxRestarts: 3, windowMs: 10 * 60 * 1000 };

/**
 * Counts the starts of one connector's program. The first start is free;
 * every later one is a restart, and only `maxRestarts` of those may fall
 * within any `windowMs`, so a program that crashes at every start doesn't
 * loop.
 */
export class RestartLimit {
  readonly #limits: RestartLimits;
  readonly #clock: Clock;
  #started = false;
  /** When each restart within the window happened, in milliseconds, oldest first. */
  #restarts: number[] = [];

  constructor(limits: RestartLimits, clock: Clock) {
    this.#limits = limits;
    this.#clock = clock;
  }

  /** Whether the program may start now. Records nothing. */
  allowsStart(): boolean {
    if (!this.#started) return true;
    return this.#recentRestarts().length < this.#limits.maxRestarts;
  }

  /** Records a start, the first one or a restart. */
  recordStart(): void {
    if (!this.#started) {
      this.#started = true;
      return;
    }
    this.#restarts = [...this.#recentRestarts(), this.#clock.now().getTime()];
  }

  #recentRestarts(): number[] {
    const since = this.#clock.now().getTime() - this.#limits.windowMs;
    return this.#restarts.filter((at) => at > since);
  }
}
