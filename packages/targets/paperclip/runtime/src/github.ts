/**
 * The runtime's only ways to reach GitHub: GET requests to the REST API's own
 * origin, and read-only GraphQL queries to its `/graphql` endpoint, with the
 * read token the plugin's installer set. It never sends the token anywhere
 * else and never writes.
 */

/** The part of `fetch` the reader uses, so tests can answer from fixtures. */
export type Fetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string>; redirect: "error" },
) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** Sends one GET and returns the parsed JSON body. */
export type GitHubGet = (path: string) => Promise<unknown>;

/** The GitHub API's origin. */
export const gitHubApi = "https://api.github.com";

/** A GET-only reader for the GitHub API, with the token when there is one. */
export function gitHubReader(options: { fetch: Fetch; token?: string | undefined }): GitHubGet {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    // GitHub refuses a request without a User-Agent, and Paperclip's outbound HTTP adds none.
    "user-agent": "halonic-paperclip-runtime",
  };
  if (options.token !== undefined && options.token !== "") {
    headers["authorization"] = `Bearer ${options.token}`;
  }
  return async (path) => {
    const url = new URL(path, gitHubApi);
    if (url.origin !== gitHubApi) {
      throw new Error(`GitHub: refusing to send the token to ${url.origin}.`);
    }
    // A redirect would carry the token to wherever GitHub's answer points, past the origin
    // check above, so the request fails instead of following it.
    const response = await options.fetch(url.href, { method: "GET", headers, redirect: "error" });
    if (!response.ok) {
      throw new Error(`GitHub: GET ${url.pathname} answered ${response.status}.`);
    }
    return response.json();
  };
}

/**
 * The part of `fetch` the GraphQL reader uses: one POST with a JSON body,
 * to the GraphQL endpoint only.
 */
export type QueryFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; redirect: "error" },
) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** Sends one read-only GraphQL query with its variables and returns its `data`. */
export type GitHubQuery = (
  document: string,
  variables: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/** The GraphQL endpoint, on the REST API's own origin. */
export const gitHubGraphql = `${gitHubApi}/graphql`;

/** Whether a document only reads: it starts with `query` and names no other operation. */
export function isReadOnlyQuery(document: string): boolean {
  const code = document.replace(/#[^\n]*/g, "");
  return /^\s*query\b/.test(code) && !/\b(?:mutation|subscription)\b/.test(code);
}

interface GraphqlBody {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message?: string }[];
}

/**
 * A query-only reader for GitHub's GraphQL API, with the same read token as
 * `gitHubReader`. Some reads, such as the merge queue, exist only there.
 * GraphQL takes even a read as a POST, so the reader posts to one URL,
 * `https://api.github.com/graphql`, and refuses a mutation or subscription
 * before anything is sent. Ported from `tooling/paperclip`'s `snapshot/graphql.ts`.
 */
export function gitHubQueryReader(options: {
  fetch: QueryFetch;
  token?: string | undefined;
}): GitHubQuery {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    // As in the REST reader: GitHub refuses a request without a User-Agent.
    "user-agent": "halonic-paperclip-runtime",
  };
  if (options.token !== undefined && options.token !== "") {
    headers["authorization"] = `Bearer ${options.token}`;
  }
  return async (document, variables) => {
    if (!isReadOnlyQuery(document)) {
      throw new Error("GitHub: refusing a GraphQL document that isn't a query.");
    }
    const response = await options.fetch(gitHubGraphql, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: document, variables }),
      redirect: "error",
    });
    const body = (await response.json().catch(() => null)) as GraphqlBody | null;
    // GitHub answers a failed query with 200 and `errors`; a partial `data` isn't trusted.
    const message = body?.errors?.[0]?.message;
    if (!response.ok || message !== undefined || body?.data == null) {
      const reason = message === undefined ? "" : `: ${message}`;
      throw new Error(`GitHub: the GraphQL query answered ${response.status}${reason}.`);
    }
    return body.data;
  };
}

/** A check's state on a commit: its newest run decides, and a cancelled run isn't red. */
export type CheckState = "success" | "failure" | "pending" | "missing";

interface CheckRun {
  readonly status?: string;
  readonly conclusion?: string | null;
  readonly started_at?: string | null;
}

/** The state of the newest run of one check on a commit. */
export async function checkState(
  get: GitHubGet,
  repo: string,
  sha: string,
  checkName: string,
): Promise<CheckState> {
  const body = (await get(
    `/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(checkName)}&per_page=100`,
  )) as { check_runs?: CheckRun[] };
  const newest = [...(body.check_runs ?? [])].sort((a, b) =>
    (b.started_at ?? "").localeCompare(a.started_at ?? ""),
  )[0];
  if (newest === undefined) {
    return "missing";
  }
  if (newest.status !== "completed") {
    return "pending";
  }
  if (newest.conclusion === "success") {
    return "success";
  }
  return newest.conclusion === "cancelled" || newest.conclusion === "skipped"
    ? "pending"
    : "failure";
}
