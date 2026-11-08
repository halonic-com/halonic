import { MemoryRecordStore } from "@halonicjs/adapter-memory";
import type { Clock, RecordChange } from "@halonicjs/ports";
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

/** A store and a clock that coordination adapters in one test share, as processes before and after a restart would. */
export interface World {
  store: FlakyRecordStore;
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
  return { store: new FlakyRecordStore(), clock: new ManualClock(), newToken };
}

/** Starts a coordination adapter in `world`. */
export function startCoordination(world: World = newWorld()) {
  const coordination = new NodeCoordination(world);
  return { ...world, world, coordination };
}
