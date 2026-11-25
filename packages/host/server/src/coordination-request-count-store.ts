import type { Coordination } from "@halonicjs/ports";
import type { RequestCountStore } from "./request-count-store-api.ts";
import { sha256Hex } from "./stored-session.ts";

const totalKeyPrefix = "daily-requests:";
const scopeKeyPrefix = "daily-request-share:";

/** How often a scope's count is tried again after a parallel request changed it first. */
const maxScopeCountAttempts = 100;

/** `<day> <count>`, the value a scope's count is kept in. */
const scopeCountPattern = /^(\d{4}-\d{2}-\d{2}) (\d+)$/;

/** A scope's count and the day it belongs to. */
interface DayCount {
  readonly day: string;
  readonly count: number;
}

/**
 * Counts requests in a {@link Coordination}, so the count is as atomic and as
 * durable as the coordination behind it. The deployment's total is one
 * counter per UTC day; past days stay in the store, each one small entry.
 * A scope's count is one value per scope that the next day overwrites, so the
 * store grows with the number of scopes and not with scopes times days.
 */
export class CoordinationRequestCountStore implements RequestCountStore {
  readonly #coordination: Coordination;

  constructor(coordination: Coordination) {
    this.#coordination = coordination;
  }

  async countRequest(
    day: string,
    limit: number,
    scope?: string,
  ): Promise<{ allowed: boolean; count: number }> {
    if (scope === undefined) {
      const result = await this.#coordination.increment(`${totalKeyPrefix}${day}`, 1, limit);
      return { allowed: result.applied, count: result.value };
    }
    // The name is hashed, so any scope name fits the key's length limit, and the prefix keeps
    // every scope's key apart from the total's.
    const key = `${scopeKeyPrefix}${await sha256Hex(scope)}`;
    return this.#countScopeRequest(key, day, limit);
  }

  /**
   * Adds one to a scope's count with compare-and-set, since a counter can't be reset when the
   * day changes. A request that loses the race reads the new value and tries again.
   */
  async #countScopeRequest(
    key: string,
    day: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    for (let attempt = 0; attempt < maxScopeCountAttempts; attempt += 1) {
      const stored = await this.#coordination.read(key);
      const current = dayCountOf(stored, day);
      if (current.count >= limit) {
        return { allowed: false, count: current.count };
      }
      const next = `${current.day} ${current.count + 1}`;
      if (await this.#coordination.compareAndSet(key, stored, next)) {
        return { allowed: true, count: current.count + 1 };
      }
    }
    throw new Error(
      `A scope's daily request count changed under ${maxScopeCountAttempts} attempts in a row`,
    );
  }
}

/**
 * The count a request on `day` adds to. A count from an earlier day starts again from zero.
 * A count from a later day stays: another instance already moved on to the next UTC day, so
 * this late request counts there rather than resetting it.
 */
function dayCountOf(stored: string | null, day: string): DayCount {
  if (stored === null) {
    return { day, count: 0 };
  }
  const match = scopeCountPattern.exec(stored);
  const [, storedDay, storedCount] = match ?? [];
  if (storedDay === undefined || storedCount === undefined) {
    throw new Error("A scope's daily request count is stored in an unknown form");
  }
  return storedDay < day ? { day, count: 0 } : { day: storedDay, count: Number(storedCount) };
}
