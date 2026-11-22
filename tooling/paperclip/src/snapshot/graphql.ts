import { type Fetch, gitHubApi } from "../pr-watcher/github.ts";

/**
 * Reads GitHub's GraphQL API. Read-only like the REST reader: it posts only
 * to `https://api.github.com/graphql`, and only a document that is a single
 * `query`. A mutation or subscription is refused before anything is sent,
 * so the token can't change anything even if a document is wrong.
 */

/** Sends one query with its variables and returns its `data`. */
export type GitHubQuery = (
  document: string,
  variables: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/** The GraphQL endpoint, on the REST API's own origin. */
export const gitHubGraphql = `${gitHubApi}/graphql`;

/** Whether a document only reads: it starts with `query` and names no other operation. */
export function isReadOnly(document: string): boolean {
  const code = document.replace(/#[^\n]*/g, "");
  return /^\s*query\b/.test(code) && !/\b(?:mutation|subscription)\b/.test(code);
}

interface GraphqlBody {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message?: string }[];
}

/** A query-only reader for GitHub's GraphQL API, with the token when there is one. */
export function gitHubQueryReader(options: {
  fetch: Fetch;
  token?: string | undefined;
}): GitHubQuery {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    // As in the REST reader: GitHub refuses a request without a User-Agent.
    "user-agent": "halonic-agent-tools",
  };
  if (options.token !== undefined && options.token !== "") {
    headers["authorization"] = `Bearer ${options.token}`;
  }
  return async (document, variables) => {
    if (!isReadOnly(document)) {
      throw new Error("GitHub: refusing a GraphQL document that isn't a query.");
    }
    const response = await options.fetch(gitHubGraphql, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: document, variables }),
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
