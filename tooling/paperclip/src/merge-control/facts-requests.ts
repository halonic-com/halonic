import type { GitHubGet } from "../pr-watcher/github.ts";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import type { BoundedCache } from "./facts-cache.ts";

/**
 * Counts the GitHub requests one pass of the facts reader sends (HAL-17863).
 * The reader shares the PR watcher's read-only token, so the shadow day's
 * log has to show what a pass costs of that token's rate budget before
 * merge control acts. Capacity GETs go to our own hosts, not GitHub, and
 * aren't counted.
 */

/** What one pass sent to GitHub. */
export interface RequestCount {
  /** REST GETs, one per page. */
  restGets: number;
  graphqlQueries: number;
  /** The GraphQL points the answers named in `rateLimit.cost`. */
  graphqlCost: number;
  /** The points left after the newest answer that named them, or null. */
  graphqlRemaining: number | null;
}

/** The answer's `rateLimit`, when the document asked for it. */
function rateLimitOf(data: unknown): { cost?: unknown; remaining?: unknown } | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const rateLimit = (data as { rateLimit?: unknown }).rateLimit;
  return typeof rateLimit === "object" && rateLimit !== null ? rateLimit : undefined;
}

/** Wraps the two GitHub readers so every request they send is counted. */
export function countedGitHub(get: GitHubGet, query: GitHubQuery) {
  const count: RequestCount = {
    restGets: 0,
    graphqlQueries: 0,
    graphqlCost: 0,
    graphqlRemaining: null,
  };
  const countedGet: GitHubGet = async (path) => {
    count.restGets += 1;
    return await get(path);
  };
  const countedQuery: GitHubQuery = async (document, variables) => {
    count.graphqlQueries += 1;
    const data = await query(document, variables);
    const rateLimit = rateLimitOf(data);
    if (typeof rateLimit?.cost === "number") {
      count.graphqlCost += rateLimit.cost;
    }
    if (typeof rateLimit?.remaining === "number") {
      count.graphqlRemaining = rateLimit.remaining;
    }
    return data;
  };
  return { get: countedGet, query: countedQuery, count };
}

/** The pass's log line. */
export function requestCountLine(count: RequestCount): string {
  const remaining =
    count.graphqlRemaining === null ? "" : `, ${count.graphqlRemaining} points left`;
  return `GitHub requests this pass: ${count.restGets} REST GETs, ${count.graphqlQueries} GraphQL queries (cost ${count.graphqlCost}${remaining})`;
}

/** How long a read-only GET's answer is served again without asking GitHub (HAL-17913). */
export const getCacheMs = 90_000;

/** GET answers by path, with when they were read. */
export type GetCache = BoundedCache<{ readonly at: number; readonly body: unknown }>;

/**
 * Serves a GET read less than 90 s before `now` from `cache`, so a pass
 * every minute doesn't ask again; put in front of the counted reader, a
 * served answer isn't a request and isn't counted. A failed read isn't kept.
 */
export function cachedGet(get: GitHubGet, cache: GetCache, now: Date): GitHubGet {
  return async (path) => {
    const kept = cache.get(path);
    if (kept !== undefined && now.getTime() - kept.at < getCacheMs) {
      return kept.body;
    }
    const body = await get(path);
    cache.set(path, { at: now.getTime(), body });
    return body;
  };
}
