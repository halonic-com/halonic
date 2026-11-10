import { addCounts, findingsIn, type PullRequestFindings } from "./findings.ts";

/**
 * Reads pull requests and their comments through the GitHub REST API.
 * Read-only: it only sends GET requests, and only to the API's own origin,
 * so the token never goes anywhere else.
 */

export type Fetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<Pick<Response, "ok" | "status" | "headers" | "json">>;

export interface GitHubReader {
  /** Yields each page of a list endpoint, following the `Link` header. */
  pages(path: string): AsyncGenerator<readonly unknown[]>;
}

export const gitHubApi = "https://api.github.com";

/** The `next` URL of a `Link` header, if there is one. */
export function nextLink(header: string | null): string | undefined {
  for (const part of header?.split(",") ?? []) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

export function createReader(options: {
  fetch: Fetch;
  token?: string | undefined;
  api?: string;
}): GitHubReader {
  const api = new URL(options.api ?? gitHubApi);
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (options.token !== undefined && options.token !== "") {
    headers["authorization"] = `Bearer ${options.token}`;
  }
  return {
    async *pages(path) {
      let url: string | undefined = new URL(path, api).href;
      while (url !== undefined) {
        if (new URL(url).origin !== api.origin) {
          throw new Error(`GitHub: refusing to follow a link to ${new URL(url).origin}.`);
        }
        const response = await options.fetch(url, { method: "GET", headers });
        if (!response.ok) {
          throw new Error(`GitHub: GET ${new URL(url).pathname} answered ${response.status}.`);
        }
        const body: unknown = await response.json();
        if (!Array.isArray(body)) {
          throw new Error(`GitHub: GET ${new URL(url).pathname} did not return a list.`);
        }
        yield body;
        url = nextLink(response.headers.get("link"));
      }
    },
  };
}

/** Merged between `since` (included) and `until` (left out), as ISO dates or times. */
export interface Window {
  readonly since: string;
  readonly until: string;
}

interface PullRequest {
  readonly number: number;
  readonly title: string;
  readonly merged_at: string | null;
  readonly updated_at: string;
}

function isPullRequest(value: unknown): value is PullRequest {
  const pull = value as Partial<PullRequest> | null;
  return typeof pull?.number === "number" && typeof pull.updated_at === "string";
}

/** The pull requests of `repo` ("owner/name") merged inside the window, oldest first. */
export async function mergedPullRequests(
  reader: GitHubReader,
  repo: string,
  window: Window,
): Promise<PullRequest[]> {
  const since = Date.parse(window.since);
  const until = Date.parse(window.until);
  const found: PullRequest[] = [];
  const path = `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`;
  for await (const page of reader.pages(path)) {
    const pulls = page.filter(isPullRequest);
    for (const pull of pulls) {
      const merged = pull.merged_at === null ? Number.NaN : Date.parse(pull.merged_at);
      if (merged >= since && merged < until) {
        found.push(pull);
      }
    }
    // Sorted by last update: once a page ends before the window, nothing
    // later can have been merged inside it.
    const last = pulls.at(-1);
    if (last === undefined || Date.parse(last.updated_at) < since) {
      break;
    }
  }
  return found.sort((a, b) => Date.parse(a.merged_at ?? "") - Date.parse(b.merged_at ?? ""));
}

async function bodies(reader: GitHubReader, path: string): Promise<string[]> {
  const texts: string[] = [];
  for await (const page of reader.pages(path)) {
    for (const item of page) {
      const body = (item as { body?: unknown } | null)?.body;
      if (typeof body === "string") {
        texts.push(body);
      }
    }
  }
  return texts;
}

/**
 * The text of every review, inline review comment and conversation comment
 * on a pull request. The description is left out: it is the author's, not
 * a review.
 */
export async function reviewTexts(
  reader: GitHubReader,
  repo: string,
  number: number,
): Promise<string[]> {
  const base = `/repos/${repo}`;
  const lists = await Promise.all([
    bodies(reader, `${base}/pulls/${number}/reviews?per_page=100`),
    bodies(reader, `${base}/pulls/${number}/comments?per_page=100`),
    bodies(reader, `${base}/issues/${number}/comments?per_page=100`),
  ]);
  return lists.flat();
}

/** The tagged findings of each pull request merged inside the window. */
export async function reviewFindings(
  reader: GitHubReader,
  repo: string,
  window: Window,
): Promise<PullRequestFindings[]> {
  const rows: PullRequestFindings[] = [];
  for (const pull of await mergedPullRequests(reader, repo, window)) {
    const texts = await reviewTexts(reader, repo, pull.number);
    rows.push({
      number: pull.number,
      title: pull.title,
      mergedAt: pull.merged_at ?? "",
      findings: addCounts(...texts.map(findingsIn)),
    });
  }
  return rows;
}
