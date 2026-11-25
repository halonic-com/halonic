import type { GitHubGet } from "../pr-watcher/github.ts";
import type { GitHubQuery } from "../snapshot/graphql.ts";

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
