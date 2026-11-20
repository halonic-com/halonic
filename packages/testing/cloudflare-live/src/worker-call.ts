import { edgeAttempts, edgeWaitMs, isEdgeNotFound } from "@halonicjs/target-cloudflare-testing";

/** A deployed Worker the smoke and admin checks call. */
export interface WorkerTarget {
  /** The Worker's address, such as `https://hlt-1-1.example.workers.dev`. */
  readonly baseUrl: string;
  /** Tests inject this; defaults to `fetch`. */
  readonly fetch?: typeof fetch;
  /** Tests inject this; defaults to a timer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * All the waiting on Cloudflare's edge one check may do, across its calls: below the live config's
 * 60 s `testTimeout`, so an edge that keeps refusing fails as {@link EdgeNotRouted}, not a timeout.
 * One call alone still gets all its tries (1 + 2 + 4 + 4 × 8 = 39 s).
 */
export const edgeBudgetMs = 40_000;

/** Cloudflare's edge still answered its own not-found page when the check's waits ran out. */
export class EdgeNotRouted extends Error {
  constructor(method: string, url: URL, waitedMs: number) {
    // The path only: the key-in-URL check puts a key in the query.
    super(
      `${method} ${url.pathname} was answered 404 by Cloudflare's edge, not the Worker, after ` +
        `${waitedMs / 1000} s of tries: the edge doesn't route ${url.host} yet.`,
    );
    this.name = "EdgeNotRouted";
  }
}

/** What the Worker answered: its status, its JSON `code` if it sent one, and its text. */
export interface Answer {
  status: number;
  code: string | undefined;
  text: string;
}

/** Calls the Worker at `path` (a GET unless `method` says otherwise). */
export type Call = (
  path: string,
  headers?: Record<string, string>,
  method?: string,
) => Promise<Answer>;

/**
 * Calls for one check. Each call asks again while the edge answers its not-found page, which never
 * reached the Worker; the waits of all the calls share {@link edgeBudgetMs}.
 */
export function caller(target: WorkerTarget): Call {
  const sleep = target.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let waitedMs = 0;
  const fetchPastEdge = async (url: URL, init: RequestInit): Promise<Response> => {
    for (let attempt = 1; ; attempt += 1) {
      const response = await (target.fetch ?? fetch)(url, init);
      if (!isEdgeNotFound(response)) return response;
      await response.body?.cancel();
      const waitMs = edgeWaitMs(attempt);
      if (attempt >= edgeAttempts || waitedMs + waitMs > edgeBudgetMs) {
        throw new EdgeNotRouted(init.method ?? "GET", url, waitedMs);
      }
      waitedMs += waitMs;
      await sleep(waitMs);
    }
  };
  return async (path, headers = {}, method = "GET") => {
    const url = new URL(path, target.baseUrl);
    // A key must not travel in the clear, and a redirect must not carry it somewhere else.
    if (url.protocol !== "https:")
      throw new Error(`The Worker address ${url.origin} is not HTTPS.`);
    const response = await fetchPastEdge(url, { method, headers, redirect: "error" });
    const text = await response.text();
    let code: string | undefined;
    try {
      const parsed = (JSON.parse(text) as { code?: unknown } | null)?.code;
      code = typeof parsed === "string" ? parsed : undefined;
    } catch {
      code = undefined;
    }
    return { status: response.status, code, text };
  };
}
