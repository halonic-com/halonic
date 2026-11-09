import type { AnnouncerTimers } from "../announcer/timers.ts";

interface Scheduled {
  readonly at: number;
  readonly order: number;
  readonly callback: () => void;
}

/** Timers for tests: time moves only when `advance` is called. */
export class FakeTimers implements AnnouncerTimers {
  private time = 0;
  private nextHandle = 1;
  private readonly scheduled = new Map<number, Scheduled>();

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): number {
    const handle = this.nextHandle++;
    this.scheduled.set(handle, { at: this.time + ms, order: handle, callback });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === "number") {
      this.scheduled.delete(handle);
    }
  }

  /** Moves time on by `ms`, running each timer that falls due, in order. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (let next = this.due(end); next !== undefined; next = this.due(end)) {
      const [handle, timer] = next;
      this.scheduled.delete(handle);
      this.time = timer.at;
      timer.callback();
    }
    this.time = end;
  }

  /** How many timers are waiting. */
  get pending(): number {
    return this.scheduled.size;
  }

  private due(end: number): [number, Scheduled] | undefined {
    let first: [number, Scheduled] | undefined;
    for (const entry of this.scheduled) {
      const timer = entry[1];
      if (timer.at > end) {
        continue;
      }
      if (first === undefined || compare(timer, first[1]) < 0) {
        first = entry;
      }
    }
    return first;
  }
}

function compare(left: Scheduled, right: Scheduled): number {
  return left.at - right.at || left.order - right.order;
}
