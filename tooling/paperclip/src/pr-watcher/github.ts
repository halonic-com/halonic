import type { CheckState, PullFacts } from "./decide.ts";

/**
 * Reads what the PR watcher needs from the GitHub REST API. Read-only: it
 * only sends GET requests, and only to the API's own origin, so the token
 * never goes anywhere else.
 */

/** The part of `fetch` the readers use, so tests can answer from recordings. */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; redirect?: "manual" },
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
    // GitHub refuses a request without a User-Agent with 403, and the host's
    // outbound HTTP doesn't add one.
    "user-agent": "halonic-agent-tools",
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
      const reason = await gitHubMessage(response);
      throw new Error(`GitHub: GET ${url.pathname} answered ${response.status}${reason}.`);
    }
    return response.json();
  };
}

/** GitHub's own reason for a refusal, from its `message` field, or nothing. */
async function gitHubMessage(response: Pick<Response, "json">): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown } | null;
    return typeof body?.message === "string" ? `: ${body.message}` : "";
  } catch {
    // An error without a JSON body still reports its status.
    return "";
  }
}

/** One run of a check, as the REST API lists it. */
export interface CheckRun {
  readonly status?: string;
  readonly conclusion?: string | null;
  readonly started_at?: string | null;
}

/** A draft's `ci-ok`: the light run's name. */
export const draftCiOkName = "ci-ok (draft, light run)";

/** The newest `ci-ok` run's result on a commit. A cancelled run isn't red. */
export async function ciOk(
  get: GitHubGet,
  repo: string,
  sha: string,
  checkName = "ci-ok",
): Promise<CheckState> {
  const body = (await get(
    `/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(checkName)}&per_page=100`,
  )) as {
    check_runs?: CheckRun[];
  };
  return newestCheck(body.check_runs ?? []);
}

/** The result of the newest of one check's runs. A cancelled or skipped run counts as pending. */
export function newestCheck(checkRuns: readonly CheckRun[]): CheckState {
  const runs = [...checkRuns].sort((a, b) =>
    (b.started_at ?? "").localeCompare(a.started_at ?? ""),
  );
  const newest = runs[0];
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

/** A review, inline comment or conversation comment, as the REST API lists it. */
export interface Review {
  readonly id?: number;
  readonly commit_id?: string;
  readonly original_commit_id?: string;
  readonly submitted_at?: string;
  readonly created_at?: string;
  readonly state?: string;
  readonly body?: string | null;
  readonly author_association?: string;
}

/**
 * Who may ask our authors for changes: the repository's owner, members of
 * its organization and its collaborators. On a public repository anyone else
 * can comment too, and their comments don't wake anyone.
 */
const reviewerAssociations: ReadonlySet<string> = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function byReviewer(item: { readonly author_association?: string }): boolean {
  return reviewerAssociations.has(item.author_association ?? "");
}

/** Every item of a list endpoint, page by page. */
export async function everyPage(get: GitHubGet, path: string): Promise<unknown[]> {
  const items: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const list = (await get(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    )) as unknown[];
    items.push(...list);
    if (list.length < 100) {
      return items;
    }
  }
}

/**
 * A review or conversation comment that asks the author for something: a
 * finding tagged `[blocker]`, `[major]` or `[minor]` (docs/guides/review.md),
 * or a verdict "changes requested" at the start of a line or right after a
 * `Name:` lead-in ("Liam: changes requested on head …"). Approvals, `[nit]`s,
 * "No changes requested" and "addressed the changes requested" don't wake anyone.
 */
export function asksForChanges(body: string): boolean {
  return (
    /^\s*(?:[-*]\s+)?\[(?:blocker|major|minor)\]/im.test(body) ||
    /^[ \t]*(?:[-*>][ \t]+)?(?:[^\n]{0,80}?:[ \t]*)?(?:\*\*|_)?changes requested\b/im.test(body)
  );
}

/**
 * The newest review comment the author may not have seen, from someone who
 * may review (`byReviewer`): a review on the
 * head commit that requests changes or asks for them in words, an inline
 * comment on the head commit, or a conversation comment that asks for
 * changes. Our reviewers post most reviews as conversation comments, since
 * every agent shares one GitHub account. Conversation comments have no
 * commit, so after a push an older finding comes back under the new head's
 * key; only the `seenUntil` check in `newReasons` keeps it quiet, which
 * holds as long as the author comments on the task after each run.
 */
export async function latestReview(
  get: GitHubGet,
  repo: string,
  number: number,
  head: string,
): Promise<PullFacts["latestReview"]> {
  const [reviews, inline, conversation] = (await Promise.all([
    everyPage(get, `/repos/${repo}/pulls/${number}/reviews`),
    get(`/repos/${repo}/pulls/${number}/comments?sort=created&direction=desc&per_page=100`),
    everyPage(get, `/repos/${repo}/issues/${number}/comments`),
  ])) as [Review[], Review[], Review[]];
  return newestFinding({ reviews, inline, conversation }, head);
}

/** The reviewer a finding's opening names ("Liam: changes requested …"), when it names one. */
function findingBy(body: string | null | undefined): { by?: string } {
  const by = /\b(Liam|Julian)\b/.exec((body ?? "").slice(0, 160))?.[1];
  return by === undefined ? {} : { by };
}

/** `latestReview`'s rule on lists already read, by REST or GraphQL. */
export function newestFinding(
  lists: {
    readonly reviews: readonly Review[];
    readonly inline: readonly Review[];
    readonly conversation: readonly Review[];
  },
  head: string,
): PullFacts["latestReview"] {
  const { reviews, inline, conversation } = lists;
  const found = [
    ...reviews
      .filter(byReviewer)
      .filter((review) => review.commit_id === head)
      .filter((review) => review.state === "CHANGES_REQUESTED" || asksForChanges(review.body ?? ""))
      .map((review) => ({
        id: `r${review.id}`,
        at: review.submitted_at ?? "",
        ...findingBy(review.body),
      })),
    ...inline
      .filter(byReviewer)
      .filter((comment) => (comment.original_commit_id ?? comment.commit_id) === head)
      .map((comment) => ({
        id: `c${comment.id}`,
        at: comment.created_at ?? "",
        ...findingBy(comment.body),
      })),
    ...conversation
      .filter(byReviewer)
      .filter((comment) => asksForChanges(comment.body ?? ""))
      .map((comment) => ({
        id: `i${comment.id}`,
        at: comment.created_at ?? "",
        ...findingBy(comment.body),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return found[0];
}

/** Whether the pull request's last merge-queue event put it in the queue. */
export async function inMergeQueue(get: GitHubGet, repo: string, number: number): Promise<boolean> {
  // The timeline runs oldest first, so it reads every page for the newest event.
  const events = (await everyPage(get, `/repos/${repo}/issues/${number}/timeline`)) as {
    event?: string;
  }[];
  const queueEvents = events
    .map((item) => item.event)
    .filter((event) => event === "added_to_merge_queue" || event === "removed_from_merge_queue");
  return queueEvents.at(-1) === "added_to_merge_queue";
}
