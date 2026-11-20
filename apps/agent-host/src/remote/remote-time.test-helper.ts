import type { RemoteTime } from "./remote-time.ts";

/** A {@link RemoteTime} that moves only when a test calls `advance`, so no test sleeps. */
export class ManualTime implements RemoteTime {
  #nowMs = Date.parse("2026-11-20T08:00:00.000Z");
  #sleepers: { wakesAt: number; wake: () => void }[] = [];

  now(): Date {
    return new Date(this.#nowMs);
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((wake) => this.#sleepers.push({ wakesAt: this.#nowMs + ms, wake }));
  }

  /** Moves the time forward, wakes every wait that is over, and lets what they started run. */
  async advance(ms: number): Promise<void> {
    this.#nowMs += ms;
    const due = this.#sleepers.filter((sleeper) => sleeper.wakesAt <= this.#nowMs);
    this.#sleepers = this.#sleepers.filter((sleeper) => sleeper.wakesAt > this.#nowMs);
    for (const sleeper of due) sleeper.wake();
    await settled();
  }
}

/** Lets every promise callback that is due run. */
export function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
