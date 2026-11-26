import type { Clock, ScheduledTimer, Scheduler, SchedulerListener } from "@halonicjs/ports";

/**
 * A scheduler on a clock the test moves: {@link FakeScheduler.pass} moves the clock forward and
 * delivers each timer when its time comes, one at a time, as a real scheduler would. Nothing
 * runs until the test lets time pass.
 */
export class FakeScheduler implements Scheduler {
  readonly clock: Clock;
  #now: number;
  readonly #timers = new Map<string, ScheduledTimer>();
  #listener: SchedulerListener | undefined;

  constructor(startAt: string) {
    this.#now = Date.parse(startAt);
    this.clock = { now: () => new Date(this.#now) };
  }

  /** Sets who gets the timers; bound late, since the listener needs this scheduler first. */
  listen(listener: SchedulerListener): void {
    this.#listener = listener;
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.#timers.set(`${key}/${timerId}`, { key, timerId, at });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.#timers.delete(`${key}/${timerId}`);
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.#timers.values()]
      .filter((timer) => timer.key === key)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  /** How long from now until the timer `key`/`timerId` is due, or `undefined` when none is set. */
  dueIn(key: string, timerId: string): number | undefined {
    const timer = this.#timers.get(`${key}/${timerId}`);
    return timer === undefined ? undefined : Date.parse(timer.at) - this.#now;
  }

  /** Lets `ms` pass, delivering every timer that comes due on the way at its own time. */
  async pass(ms: number): Promise<void> {
    const end = this.#now + ms;
    for (let next = this.#earliest(); next !== undefined; next = this.#earliest()) {
      const at = Date.parse(next.at);
      if (at > end) break;
      this.#now = Math.max(this.#now, at);
      this.#timers.delete(`${next.key}/${next.timerId}`);
      await this.#listener?.onTimer(next);
    }
    this.#now = end;
  }

  #earliest(): ScheduledTimer | undefined {
    return [...this.#timers.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  }
}
