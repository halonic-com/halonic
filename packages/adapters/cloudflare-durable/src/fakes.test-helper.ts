import { type Clock, fixedClockStart } from "@halonicjs/std";
import type { StateStorage, StateTransaction } from "./coordination-state.ts";

/**
 * Durable Object storage in memory, for running the contract in Node. Like
 * a Durable Object it lets one transaction at a time run, and a transaction
 * that throws leaves nothing behind. It can't show what workerd does with
 * real storage; `coordination.test.ts` runs the same contract there.
 */
export class FakeStateStorage implements StateStorage {
  readonly #entries = new Map<string, unknown>();
  #lastTransaction: Promise<unknown> = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return this.#entries.get(key) as T | undefined;
  }

  transaction<T>(change: (transaction: StateTransaction) => Promise<T>): Promise<T> {
    const run = this.#lastTransaction.then(() => this.#runOnCopy(change));
    this.#lastTransaction = run.catch(() => undefined);
    return run;
  }

  async #runOnCopy<T>(change: (transaction: StateTransaction) => Promise<T>): Promise<T> {
    const copy = new Map(this.#entries);
    const transaction: StateTransaction = {
      get: async <V>(key: string) => copy.get(key) as V | undefined,
      put: async (key, value) => copy.set(key, value),
      delete: async (key) => copy.delete(key),
    };
    const result = await change(transaction);
    this.#entries.clear();
    for (const [key, value] of copy) this.#entries.set(key, value);
    return result;
  }
}

/** A clock that only moves when a test moves it. */
export class ManualClock implements Clock {
  #now = fixedClockStart;

  now(): Date {
    return new Date(this.#now);
  }

  advance(ms: number): void {
    this.#now += ms;
  }
}
