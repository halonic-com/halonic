import type { RequestCountStore } from "./request-count-store-api.ts";

/**
 * Keeps the count in memory, so a restart starts again from zero. It is for
 * tests and for hosts that have no durable store; `targets/node/runtime`
 * keeps the count on disk. It holds only the day it last counted, and drops
 * every scope's count when a new day starts, so it grows only with the
 * scopes counted that day.
 */
export class MemoryRequestCountStore implements RequestCountStore {
  #day = "";
  #total = 0;
  readonly #scopeCounts = new Map<string, number>();

  async countRequest(
    day: string,
    limit: number,
    scope?: string,
  ): Promise<{ allowed: boolean; count: number }> {
    if (day !== this.#day) {
      this.#day = day;
      this.#total = 0;
      this.#scopeCounts.clear();
    }
    // The total has a field of its own, so no scope name can reach it.
    const count = scope === undefined ? this.#total : (this.#scopeCounts.get(scope) ?? 0);
    if (count >= limit) {
      return { allowed: false, count };
    }
    if (scope === undefined) {
      this.#total = count + 1;
    } else {
      this.#scopeCounts.set(scope, count + 1);
    }
    return { allowed: true, count: count + 1 };
  }
}
