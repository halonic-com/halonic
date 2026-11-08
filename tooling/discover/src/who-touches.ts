/** An open pull request and the files it changes. */
export interface OpenPullRequest {
  readonly number: number;
  readonly title: string;
  readonly headRefName: string;
  readonly files: readonly { readonly path: string }[];
}

/** A package and its folder, relative to the repo root (`.` for the root package). */
export interface PackageFolder {
  readonly name: string;
  readonly directory: string;
}

/** The `fetch` the GitHub reader uses; tests pass a fake one. */
export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

const apiBase = "https://api.github.com";
const pageSize = 100;

/**
 * Reads `owner/name` from a GitHub remote URL (HTTPS or SSH).
 *
 * @returns `undefined` when the URL isn't a GitHub repo
 */
export function repoFromRemote(url: string): string | undefined {
  const match = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match?.[1];
}

/**
 * Reads every page of a GitHub list endpoint. The repo is public, so this
 * works without a token; with `GH_TOKEN` set it gets the higher rate limit.
 *
 * @throws with GitHub's own status and message when a request fails
 */
async function readAllPages<T>(path: string, fetchPage: Fetch, token?: string): Promise<T[]> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "halonic-who-touches",
  };
  if (token !== undefined && token !== "") {
    headers["authorization"] = `Bearer ${token}`;
  }
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${apiBase}${path}${separator}per_page=${pageSize}&page=${page}`;
    const response = await fetchPage(url, { headers });
    if (!response.ok) {
      throw new Error(
        `GitHub answered ${response.status} for ${url}: ${await errorText(response)}`,
      );
    }
    const batch = (await response.json()) as T[];
    items.push(...batch);
    if (batch.length < pageSize) {
      return items;
    }
  }
}

async function errorText(response: Response): Promise<string> {
  const text = await response.text();
  try {
    return (JSON.parse(text) as { message?: string }).message ?? text;
  } catch {
    return text === "" ? response.statusText : text;
  }
}

/**
 * Asks GitHub for every open pull request and every file it changes, page
 * by page, so a repo with more than 100 open pull requests or a pull
 * request with more than 100 files is read in full.
 */
export async function fetchOpenPullRequests(
  repo: string,
  options: { fetch?: Fetch; token?: string | undefined } = {},
): Promise<OpenPullRequest[]> {
  const fetchPage = options.fetch ?? fetch;
  const pulls = await readAllPages<{ number: number; title: string; head: { ref: string } }>(
    `/repos/${repo}/pulls?state=open`,
    fetchPage,
    options.token,
  );
  // One request at a time: GitHub asks clients not to fire them in parallel.
  const result: OpenPullRequest[] = [];
  for (const pull of pulls) {
    const files = await readAllPages<{ filename: string; previous_filename?: string }>(
      `/repos/${repo}/pulls/${pull.number}/files`,
      fetchPage,
      options.token,
    );
    result.push({
      number: pull.number,
      title: pull.title,
      headRefName: pull.head.ref,
      // A rename touches the package it leaves as well as the one it enters.
      files: files.flatMap((file) =>
        file.previous_filename === undefined
          ? [{ path: file.filename }]
          : [{ path: file.filename }, { path: file.previous_filename }],
      ),
    });
  }
  return result;
}

/**
 * For each package, the open pull requests that change it. `ownerOf`
 * names the package a file belongs to (tooling/check's `owningPackage`).
 */
export function touchesByPackage(
  pullRequests: readonly OpenPullRequest[],
  ownerOf: (file: string) => string,
): Map<string, OpenPullRequest[]> {
  const result = new Map<string, OpenPullRequest[]>();
  for (const pullRequest of pullRequests) {
    const touched = new Set(pullRequest.files.map((file) => ownerOf(file.path)));
    for (const name of touched) {
      const list = result.get(name) ?? [];
      list.push(pullRequest);
      result.set(name, list);
    }
  }
  return result;
}

/**
 * Finds the package a person means: its full name, its folder, or the last
 * part of either (`engine` finds `@halonicjs/engine` in `packages/core/engine`).
 * A last part that several packages share (`runtime`) is ambiguous: all of
 * them come back, so the caller can ask for the full name.
 */
export function resolvePackage(query: string, packages: readonly PackageFolder[]): PackageFolder[] {
  const trimmed = query.replace(/\/+$/, "");
  const exact = packages.find((pkg) => pkg.name === trimmed || pkg.directory === trimmed);
  if (exact !== undefined) {
    return [exact];
  }
  return packages.filter(
    (pkg) => pkg.directory.split("/").at(-1) === trimmed || pkg.name.split("/").at(-1) === trimmed,
  );
}
