import type { RequestCountStore } from "./api.ts";

/**
 * Keeps the count in memory, so a restart starts again from zero. It is for
 * tests and for hosts that have no durable store; `targets/node/runtime`
 * keeps the count on disk. It holds only the day it last counted, so it
 * doesn't grow.
 */
export class MemoryRequestCountStore implements RequestCountStore {
  #day = "";
  #count = 0;

  async countRequest(day: string, limit: number): Promise<{ allowed: boolean; count: number }> {
    if (day !== this.#day) {
      this.#day = day;
      this.#count = 0;
    }
    if (this.#count >= limit) {
      return { allowed: false, count: this.#count };
    }
    this.#count += 1;
    return { allowed: true, count: this.#count };
  }
}
