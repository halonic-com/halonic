import type { RemoteTime } from "@halonicjs/app-agent-host/remote-parts";

/**
 * The host's pairing clock, moved only by the test: a code's five minutes,
 * the two-minute Allow wait and the failed tries of a minute pass at once.
 * The gateway's own timers (the handshake's ten seconds) stay real.
 */
export class ManualTime implements RemoteTime {
  #nowMs = Date.parse("2026-11-21T08:00:00.000Z");
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
    await new Promise((resolve) => setImmediate(resolve));
  }
}
