import { MemoryRecordStore } from "@halonicjs/adapter-memory";
import type { Clock, RecordChange } from "@halonicjs/ports";
import type { SetTimer } from "./set-timer.ts";

/** The start of every fake clock: 2026-01-01T00:00:00Z. */
export const fakeStart = Date.UTC(2026, 0, 1);

/** A clock that only moves when a test moves it. */
export class ManualClock implements Clock {
  #now: number;

  constructor(start: number = fakeStart) {
    this.#now = start;
  }

  now(): Date {
    return new Date(this.#now);
  }

  /** Moves the clock forward by `ms` milliseconds. */
  advance(ms: number): void {
    this.#now += ms;
  }
}

interface PendingWakeUp {
  readonly at: number;
  readonly callback: () => void;
}

/** A {@link SetTimer} on a {@link ManualClock}: wake-ups fire only when a test calls {@link fireDue}. */
export class ManualTimers {
  readonly #clock: ManualClock;
  readonly #pending = new Set<PendingWakeUp>();
  /** Every delay asked for, in order, so tests can check when the scheduler wanted to wake. */
  readonly delays: number[] = [];

  constructor(clock: ManualClock) {
    this.#clock = clock;
  }

  readonly setTimer: SetTimer = (callback, delayMs) => {
    this.delays.push(delayMs);
    const wakeUp = { at: this.#clock.now().getTime() + delayMs, callback };
    this.#pending.add(wakeUp);
    return () => this.#pending.delete(wakeUp);
  };

  /** How many wake-ups are set and not yet fired or cancelled. */
  get pendingCount(): number {
    return this.#pending.size;
  }

  /** Fires every wake-up whose time the clock has reached. */
  fireDue(): void {
    const now = this.#clock.now().getTime();
    for (const wakeUp of [...this.#pending]) {
      if (wakeUp.at <= now) {
        this.#pending.delete(wakeUp);
        wakeUp.callback();
      }
    }
  }
}

/**
 * The shared in-memory record store, with two additions for tests:
 * `failNextAppend` makes the next write reject, and `failNextCompact` the
 * next compaction.
 */
export class FlakyRecordStore extends MemoryRecordStore {
  failNextAppend = false;
  failNextCompact = false;

  override async append(changes: readonly RecordChange[]): Promise<void> {
    if (this.failNextAppend) {
      this.failNextAppend = false;
      throw new Error("the record store is unavailable");
    }
    await super.append(changes);
  }

  override async compact(collection: string): Promise<void> {
    if (this.failNextCompact) {
      this.failNextCompact = false;
      throw new Error("the record store is unavailable");
    }
    await super.compact(collection);
  }
}
