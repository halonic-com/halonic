import type { Coordination } from "@halonicjs/ports";

/** What the server's daily ceiling needs from a store; matches `RequestCountStore` in `host/server`. */
export interface DailyRequestCounter {
  countRequest(day: string, limit: number): Promise<{ allowed: boolean; count: number }>;
}

/**
 * Counts requests per UTC day as one counter of a {@link Coordination}, so the
 * count is as atomic and as durable as the coordination behind it. Counters of
 * past days stay in the store; each is one small entry.
 */
export class CoordinationRequestCountStore implements DailyRequestCounter {
  readonly #coordination: Coordination;

  constructor(coordination: Coordination) {
    this.#coordination = coordination;
  }

  async countRequest(day: string, limit: number): Promise<{ allowed: boolean; count: number }> {
    const result = await this.#coordination.increment(`daily-requests:${day}`, 1, limit);
    return { allowed: result.applied, count: result.value };
  }
}
