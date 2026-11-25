/**
 * Counts requests per deployment and UTC day, for `limits.dailyRequests`, and
 * per scope and UTC day, for a scope's share of it.
 * Each host supplies one that survives a restart: `targets/node/runtime` keeps
 * it on disk, the Cloudflare target in its own durable store. The count is
 * atomic, so parallel requests never get past the ceiling. It is its own
 * port, not a `Coordination.increment` counter, so a host can back the count
 * of every request with a store of its own choice, apart from the shared
 * login limits and sessions.
 */
export interface RequestCountStore {
  /**
   * Counts one request for `day` unless `limit` requests were already
   * counted for it.
   *
   * @param day The UTC day as `YYYY-MM-DD`.
   * @param limit The ceiling; the count never goes above it.
   * @param scope The scope's name, such as `u/<id>`, for that scope's own count; absent for
   *   the deployment's total. The store keeps the total apart from every scope's count, and
   *   each scope's count apart from every other's, whatever the name holds.
   * @returns whether the request is within the ceiling, and the count after the call
   */
  countRequest(
    day: string,
    limit: number,
    scope?: string,
  ): Promise<{ allowed: boolean; count: number }>;
}
