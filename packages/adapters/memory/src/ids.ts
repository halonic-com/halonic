import type { IdGenerator } from "@halonicjs/ports";

/**
 * Predictable ids for tests and recorded event logs: each prefix counts up on
 * its own from 1, as `run_1`, `run_2`, `event_1`, the format of the old
 * `fixedIds`. The counter has no `_`, so two prefixes can never give the same id.
 */
export class SequentialIds implements IdGenerator {
  readonly #counters = new Map<string, number>();

  next(prefix: string): string {
    const count = (this.#counters.get(prefix) ?? 0) + 1;
    this.#counters.set(prefix, count);
    return `${prefix}_${count}`;
  }
}
