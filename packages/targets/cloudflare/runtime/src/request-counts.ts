import type { RequestCountStore } from "@halonicjs/host-server";
import type { Coordination } from "@halonicjs/ports";

/**
 * Counts requests per UTC day as one counter of the deployment's
 * {@link Coordination}, so the count is as atomic as the Durable Object behind
 * it: parallel requests never get past the ceiling. Each past day stays as one
 * small counter.
 */
export class CoordinationRequestCountStore implements RequestCountStore {
  readonly #coordination: Coordination;

  constructor(coordination: Coordination) {
    this.#coordination = coordination;
  }

  async countRequest(day: string, limit: number): Promise<{ allowed: boolean; count: number }> {
    const result = await this.#coordination.increment(`daily-requests:${day}`, 1, limit);
    return { allowed: result.applied, count: result.value };
  }
}
