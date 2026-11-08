import {
  type Clock,
  compactedChanges,
  type RecordChange,
  type RecordStore,
} from "@halonicjs/ports";
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
 * A record store in memory, for these tests only, until the shared memory
 * adapter lands on `main`. `failNextAppend` makes the next write reject.
 */
export class MemoryRecordStore implements RecordStore {
  #changes: RecordChange[] = [];
  failNextAppend = false;

  async append(changes: readonly RecordChange[]): Promise<void> {
    if (this.failNextAppend) {
      this.failNextAppend = false;
      throw new Error("the record store is unavailable");
    }
    this.#changes.push(...changes.map((change) => structuredClone(change)));
  }

  async changes(collection: string): Promise<RecordChange[]> {
    return this.#changes
      .filter((change) => change.collection === collection)
      .map((change) => structuredClone(change));
  }

  async compact(collection: string): Promise<void> {
    const kept = this.#changes.filter((change) => change.collection !== collection);
    const compacted = compactedChanges(
      collection,
      this.#changes.filter((change) => change.collection === collection),
    );
    this.#changes = [...kept, ...compacted];
  }
}
