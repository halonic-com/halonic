import { type Fetch, type GitHubGet, gitHubApi } from "../pr-watcher/github.ts";
import { type GitHubQuery, gitHubQueryReader } from "../snapshot/graphql.ts";
import type { PassCalls } from "./budget.ts";
import { type BoundedCache, boundedCache } from "./facts-cache.ts";

/**
 * One pass's GitHub reader on the read-only App token (HAL-17913). The host
 * writes a fresh installation token into the `githubToken` secret every
 * 10 minutes, so the token is read once at the start of each pass and
 * never kept across passes; a 401 reads it once more and retries once.
 * REST GETs send the ETag of the last answer, and GitHub doesn't charge a
 * 304. Every request is counted with the lowest remaining limit GitHub
 * named, in its headers or a query's `rateLimit`. The token is never put in
 * an error, a log line or the cache.
 */

/** A `fetch` whose answers may carry headers, for the rate-limit and ETag ones. */
export type ReadFetch = (
  url: string,
  init: Parameters<Fetch>[1],
) => Promise<
  Pick<Response, "ok" | "status" | "json"> & { readonly headers?: Pick<Headers, "get"> }
>;

/** The last answer to a GET, by address, for its ETag. */
export type EtagCache = BoundedCache<{ readonly etag: string; readonly body: unknown }>;

/** An empty ETag store, one per company. */
export function etagCache(): EtagCache {
  return boundedCache();
}

/** A read the pass can't recover from: the token refused twice, or GitHub's limit used up. */
export class ReadRefused extends Error {
  /** What the pass had sent before it, once the reader adds it. */
  calls: PassCalls | undefined;
}

/** What a pass reads GitHub with, and what it cost. */
export interface PassReader {
  readonly get: GitHubGet;
  readonly query: GitHubQuery;
  calls(): PassCalls;
}

type Outcome = { readonly status: number; readonly value?: unknown; readonly error?: Error };

const baseHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  // GitHub refuses a request without a User-Agent, and the host's fetch adds none.
  "user-agent": "halonic-agent-tools",
};

function headerNumber(response: Awaited<ReturnType<ReadFetch>>, name: string): number | null {
  const value = response.headers?.get(name);
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function messageOf(response: Pick<Response, "json">): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown } | null;
    return typeof body?.message === "string" ? `: ${body.message}` : "";
  } catch {
    return "";
  }
}

const notModified = /Invalid response status code 304\b/;

/**
 * Whether a fetch error is the plugin SDK failing to rebuild a 304: its worker
 * rebuilds the host's answer as `new Response(body, …)`, which refuses a 304
 * (HAL-20170).
 */
const unchangedAnswer = (error: unknown) =>
  error instanceof TypeError && notModified.test(error.message);

/** One GET with the last answer's ETag; a 304 gives that answer back. */
async function getOnce(
  options: { readonly fetch: ReadFetch; readonly token: string; readonly etags: EtagCache },
  path: string,
): Promise<Outcome> {
  const url = new URL(path, gitHubApi);
  if (url.origin !== gitHubApi) {
    throw new Error(`GitHub: refusing to send the token to ${url.origin}.`);
  }
  const kept = options.etags.get(url.href);
  let response: Awaited<ReturnType<ReadFetch>>;
  try {
    response = await options.fetch(url.href, {
      method: "GET",
      headers: {
        ...baseHeaders,
        authorization: `Bearer ${options.token}`,
        ...(kept === undefined ? {} : { "if-none-match": kept.etag }),
      },
    });
  } catch (error) {
    if (kept !== undefined && unchangedAnswer(error)) {
      return { status: 304, value: kept.body };
    }
    throw error;
  }
  if (response.status === 304 && kept !== undefined) {
    return { status: 304, value: kept.body };
  }
  if (!response.ok) {
    const reason = await messageOf(response);
    const error = new Error(`GitHub: GET ${url.pathname} answered ${response.status}${reason}.`);
    return { status: response.status, error };
  }
  const body: unknown = await response.json();
  const etag = response.headers?.get("etag");
  if (typeof etag === "string" && etag !== "") {
    options.etags.set(url.href, { etag, body });
  }
  return { status: response.status, value: body };
}

/** Counts requests and keeps the lowest remaining limit GitHub named, with its reset. */
function limitTracker() {
  let calls = 0;
  let remaining: number | null = null;
  let resetAt: string | null = null;
  const note = (left: number | null, reset: string | null) => {
    if (left !== null && (remaining === null || left <= remaining)) {
      remaining = left;
      resetAt = reset ?? resetAt;
    }
  };
  return {
    note,
    /** Counts an answer GitHub charged for and reads its rate-limit headers. */
    count(response: Awaited<ReturnType<ReadFetch>>, charged: boolean) {
      calls += charged ? 1 : 0;
      const reset = headerNumber(response, "x-ratelimit-reset");
      note(
        headerNumber(response, "x-ratelimit-remaining"),
        reset === null ? null : new Date(reset * 1000).toISOString(),
      );
    },
    calls: (): PassCalls => ({ calls, remaining, resetAt }),
  };
}

/** Starts a pass: reads the token once, then reads GitHub with it. */
export async function passReader(options: {
  readonly fetch: ReadFetch;
  readonly token: () => Promise<string>;
  readonly etags: EtagCache;
}): Promise<PassReader> {
  let token = await options.token();
  let reread = false;
  const limits = limitTracker();
  const metered: ReadFetch = async (url, init) => {
    const response = await options.fetch(url, init);
    limits.count(response, response.status !== 304);
    return response;
  };

  const settle = async (read: () => Promise<Outcome>): Promise<unknown> => {
    const outcome = await read();
    if (outcome.error === undefined) {
      return outcome.value;
    }
    const { remaining, resetAt } = limits.calls();
    if (outcome.status === 429 || (outcome.status === 403 && remaining === 0)) {
      const until = resetAt === null ? "" : ` until ${resetAt.slice(11, 16)} UTC`;
      throw new ReadRefused(`GitHub's limit for the read token is used up${until}.`);
    }
    if (outcome.status !== 401) {
      throw outcome.error;
    }
    if (reread) {
      throw new ReadRefused("GitHub refused the read token again after it was read anew.");
    }
    reread = true;
    token = await options.token();
    return await settle(read);
  };

  const get: GitHubGet = (path) =>
    settle(() => getOnce({ fetch: metered, token, etags: options.etags }, path));

  const query: GitHubQuery = (document, variables) =>
    settle(async () => {
      let status = 0;
      const reader = gitHubQueryReader({
        fetch: async (url, init) => {
          const response = await metered(url, init);
          status = response.status;
          return response;
        },
        token,
      });
      try {
        const data = await reader(document, variables);
        const rateLimit = (data as { rateLimit?: { remaining?: unknown; resetAt?: unknown } })
          .rateLimit;
        if (typeof rateLimit?.remaining === "number") {
          limits.note(
            rateLimit.remaining,
            typeof rateLimit.resetAt === "string" ? rateLimit.resetAt : null,
          );
        }
        return { status, value: data };
      } catch (error) {
        return { status, error: error as Error };
      }
    });

  return { get, query, calls: limits.calls };
}

/** Counts the writes the queue client sends, with the lowest remaining limit GitHub named. */
export function meteredWrites<F extends ReadFetch>(fetch: F) {
  const limits = limitTracker();
  const counted = (async (url, init) => {
    const response = await fetch(url, init);
    limits.count(response, true);
    return response;
  }) as F;
  return { fetch: counted, calls: limits.calls };
}
