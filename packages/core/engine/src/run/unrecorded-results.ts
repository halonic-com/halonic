// The answers of calls the engine made but couldn't record, because the
// store failed (HAL-5214). The scheduler delivers the call's timer again,
// and that delivery records the kept answer instead of making the call
// again: a mail sent once stays sent once, and a model call is paid once.

import type { DecideInput } from "../kernel/decide-types.ts";

/** Records the inputs calls gave, and keeps each one until it is recorded. */
export class UnrecordedResults {
  /** By the slot of the call's timer. Lost with the process: a restart ends or marks those runs. */
  readonly #results = new Map<string, DecideInput>();

  /**
   * Records the input kept under `slot`, if any: the call's timer is due
   * again after its record failed, and the call isn't made twice.
   *
   * @returns whether an input was kept
   */
  async recordKept(slot: string, record: (input: DecideInput) => Promise<void>): Promise<boolean> {
    const kept = this.#results.get(slot);
    if (kept === undefined) return false;
    await this.record(slot, kept, record);
    return true;
  }

  /** Records the input with `record`, keeping it under `slot` until that resolves. */
  async record(
    slot: string,
    input: DecideInput,
    record: (input: DecideInput) => Promise<void>,
  ): Promise<void> {
    this.#results.set(slot, input);
    await record(input);
    this.#results.delete(slot);
  }
}
