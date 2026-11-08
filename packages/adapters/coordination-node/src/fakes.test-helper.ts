import type { Clock, RecordChange, RecordStore } from "@halonicjs/ports";
import { NodeCoordination } from "./coordination.ts";

/** The start of every fake clock: 2026-01-01T00:00:00Z. */
export const fakeStart = Date.UTC(2026, 0, 1);

/** A clock that only moves when a test moves it. */
export class ManualClock implements Clock {
  #now = fakeStart;

  now(): Date {
    return new Date(this.#now);
  }

  /** Moves the clock forward by `ms` milliseconds. */
  advance(ms: number): void {
    this.#now += ms;
  }
}

/**
 * A record store in memory, for these tests only, until the shared memory
 * adapter lands on `main`. `failNextAppend` makes the next write reject.
 */
export class MemoryRecordStore implements RecordStore {
  readonly #changes: RecordChange[] = [];
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
}

/** A store and a clock that coordination adapters in one test share, as processes before and after a restart would. */
export interface World {
  store: MemoryRecordStore;
  clock: ManualClock;
  /** Makes predictable tokens that never repeat in the world, also across a restart. */
  newToken: () => string;
}

/** A new, empty world. */
export function newWorld(): World {
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `lease_${tokens}`;
  };
  return { store: new MemoryRecordStore(), clock: new ManualClock(), newToken };
}

/** Starts a coordination adapter in `world`. */
export function startCoordination(world: World = newWorld()) {
  const coordination = new NodeCoordination(world);
  return { ...world, world, coordination };
}
