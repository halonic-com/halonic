/**
 * The runtime's only way to reach GitHub: GET requests to the REST API's own
 * origin, with the read token the plugin's installer set. It never sends the
 * token anywhere else and never writes.
 */

/** The part of `fetch` the reader uses, so tests can answer from fixtures. */
export type Fetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
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
    const response = await options.fetch(url.href, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`GitHub: GET ${url.pathname} answered ${response.status}.`);
    }
    return response.json();
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
