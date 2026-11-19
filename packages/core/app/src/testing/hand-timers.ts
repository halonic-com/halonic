import type { SaveTimers } from "../save-scheduler.ts";

/** Timers that go off only when the test says, so no test sleeps. */
export class HandTimers implements SaveTimers {
  private next = 0;
  private readonly waiting = new Map<number, { delayMs: number; callback: () => void }>();

  set(callback: () => void, delayMs: number): number {
    this.next += 1;
    this.waiting.set(this.next, { delayMs, callback });
    return this.next;
  }

  clear(handle: unknown): void {
    this.waiting.delete(handle as number);
  }

  /** The delays of the timers still waiting, in the order they were set. */
  delays(): number[] {
    return [...this.waiting.values()].map((timer) => timer.delayMs);
  }

  /** Sets off every timer waiting now; timers they set wait for the next call. */
  fire(): void {
    const due = [...this.waiting.values()];
    this.waiting.clear();
    for (const timer of due) timer.callback();
  }
}
