import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  findHits,
  hitsIssueBody,
  hitsIssueTitle,
  type PullRequestText,
  parseLogins,
  type ScanRun,
  scanSince,
} from "../leaks/pr-comments.ts";
import {
  allowedPhrasesFile,
  loadAllowedPhrases,
  loadTerms,
  TermMatcher,
  termsEnvironmentVariable,
  termsRequiredVariable,
} from "../leaks/terms.ts";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * node tooling/check/src/cli/pr-comments.ts [--repo owner/name] [--full | --since ISO-TIME] [--apply]
 *
 * Scans pull request bodies, comments, review bodies and review comments
 * for the personal terms in $HALONIC_DENY_TERMS (HAL-20064). By default it
 * reads only what was updated since the newest run of `scheduled.yml` whose
 * scan succeeded; `--since` reads what was updated since that time and
 * `--full` reads everything. Texts by the logins in
 * $HALONIC_BOARD_LOGINS are skipped. With `--apply` a hit opens one issue,
 * or comments on the open one, listing pull request numbers and links.
 * It prints numbers and links only, never a term or the text around it.
 * Needs `gh`, signed in with pull-requests:read, actions:read and issues:write.
 */

/** The logins whose texts are not scanned: the board's, from the `leak-terms` environment. */
const skippedLoginsVariable = "HALONIC_BOARD_LOGINS";

/** The job's name in `scheduled.yml`, to find the last run it succeeded in. */
const scanJobName = "Personal terms in pull request comments";

function gh(...args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function jsonLines<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** The newest finished runs of `scheduled.yml` on main, with whether this scan succeeded in each. */
function recentRuns(repo: string): ScanRun[] {
  const runs = jsonLines<{ id: number; run_started_at: string }>(
    gh(
      "api",
      `repos/${repo}/actions/workflows/scheduled.yml/runs?branch=main&status=completed&per_page=10`,
      "--jq",
      ".workflow_runs[] | {id, run_started_at}",
    ),
  );
  return runs.map((run) => {
    const conclusions = gh(
      "api",
      `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&filter=latest`,
      "--jq",
      `.jobs[] | select(.name == "${scanJobName}") | .conclusion`,
    );
    return { startedAt: run.run_started_at, scanSucceeded: conclusions.trim() === "success" };
  });
}

interface ReviewNode {
  readonly body: string;
  readonly url: string;
  readonly author: { readonly login: string } | null;
}

interface PullRequestNode extends ReviewNode {
  readonly number: number;
  readonly updatedAt: string;
  readonly reviews: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: ReviewNode[];
  };
}

const pullRequestsQuery = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number updatedAt body url author { login }
        reviews(first: 100) { pageInfo { hasNextPage } nodes { body url author { login } } }
      }
    }
  }
}`;

/** The pull requests updated since `since` (all when undefined), newest first. */
function pullRequests(repo: string, since: string | undefined): PullRequestNode[] {
  const [owner = "", name = ""] = repo.split("/");
  const found: PullRequestNode[] = [];
  let cursor: string | undefined;
  for (;;) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${pullRequestsQuery}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `name=${name}`,
    ];
    const page = JSON.parse(
      gh(...args, ...(cursor === undefined ? [] : ["-f", `cursor=${cursor}`])),
    ).data.repository.pullRequests as {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      nodes: PullRequestNode[];
    };
    const fresh = page.nodes.filter(
      (node) => since === undefined || Date.parse(node.updatedAt) >= Date.parse(since),
    );
    found.push(...fresh);
    if (!page.pageInfo.hasNextPage || fresh.length < page.nodes.length) {
      return found;
    }
    cursor = page.pageInfo.endCursor;
  }
}

/** Every review of a pull request with more reviews than one query returns. */
function allReviews(repo: string, pullRequest: number): ReviewNode[] {
  return jsonLines<{ body: string; url: string; login: string | null }>(
    gh(
      "api",
      "--paginate",
      `repos/${repo}/pulls/${pullRequest}/reviews?per_page=100`,
      "--jq",
      '.[] | {body: (.body // ""), url: .html_url, login: .user.login}',
    ),
  ).map((review) => ({
    body: review.body,
    url: review.url,
    author: review.login === null ? null : { login: review.login },
  }));
}

function pullRequestTexts(repo: string, since: string | undefined): PullRequestText[] {
  return pullRequests(repo, since).flatMap((node) => {
    const reviews = node.reviews.pageInfo.hasNextPage
      ? allReviews(repo, node.number)
      : node.reviews.nodes;
    const text = (kind: PullRequestText["kind"], item: ReviewNode): PullRequestText => ({
      pullRequest: node.number,
      kind,
      url: item.url,
      author: item.author?.login ?? "",
      text: item.body,
    });
    return [text("body", node), ...reviews.map((review) => text("review", review))];
  });
}

/**
 * Comments from a repository-wide list (`issues/comments` or
 * `pulls/comments`), updated since `since`. Issue comments on issues, not
 * pull requests, are left out.
 */
function commentTexts(
  repo: string,
  endpoint: "issues/comments" | "pulls/comments",
  since: string | undefined,
): PullRequestText[] {
  const query = `per_page=100&sort=updated&direction=asc${since === undefined ? "" : `&since=${since}`}`;
  const parent = endpoint === "issues/comments" ? ".issue_url" : ".pull_request_url";
  const comments = jsonLines<{ number: number; url: string; login: string | null; body: string }>(
    gh(
      "api",
      "--paginate",
      `repos/${repo}/${endpoint}?${query}`,
      "--jq",
      `.[] | select(.html_url | test("/pull/")) | {number: (${parent} | split("/") | last | tonumber), url: .html_url, login: .user.login, body: (.body // "")}`,
    ),
  );
  const kind = endpoint === "issues/comments" ? "comment" : "review comment";
  return comments.map((comment) => ({
    pullRequest: comment.number,
    kind,
    url: comment.url,
    author: comment.login ?? "",
    text: comment.body,
  }));
}

/** Opens the hits issue, or comments on the open one. */
function report(repo: string, body: string): void {
  const open = gh(
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--search",
    `"${hitsIssueTitle}" in:title`,
    "--json",
    "number,title",
    "--jq",
    `[.[] | select(.title == "${hitsIssueTitle}")][0].number // empty`,
  ).trim();
  if (open !== "") {
    gh("issue", "comment", open, "--repo", repo, "--body", body);
    console.log(`pr-comments: issue #${open} updated.`);
  } else {
    gh("issue", "create", "--repo", repo, "--title", hitsIssueTitle, "--body", body);
    console.log("pr-comments: issue opened.");
  }
}

/** Asks GitHub to hide each entry in the job log; the secret is masked only as a whole. */
function mask(entries: readonly string[]): void {
  for (const entry of entries) {
    console.log(`::add-mask::${entry.replace(/%/g, "%25")}`);
  }
}

/**
 * The exit code when there are no terms to scan with: a set but empty
 * secret, or a missing one once the terms are required, fails; a missing
 * one before then passes with a notice, until the board adds the terms.
 */
function withoutTerms(): number {
  if ((process.env[termsEnvironmentVariable] ?? "").trim() !== "") {
    console.error(
      `pr-comments: FAILED. ${termsEnvironmentVariable} is set but holds no usable term.`,
    );
    return 1;
  }
  if (process.env[termsRequiredVariable] === "true") {
    console.error(
      `pr-comments: FAILED. ${termsRequiredVariable} is true but ${termsEnvironmentVariable} is not set.`,
    );
    return 1;
  }
  console.log(
    `::notice title=pr-comments::${termsEnvironmentVariable} is not set yet, so pull request comments were not scanned.`,
  );
  return 0;
}

function main(): number {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: process.env["GITHUB_REPOSITORY"] ?? "halonic-com/halonic" },
      full: { type: "boolean", default: false },
      since: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const { terms, source } = loadTerms();
  const skippedLogins = parseLogins(process.env[skippedLoginsVariable] ?? "");
  if (process.env["GITHUB_ACTIONS"]) {
    mask([...terms, ...skippedLogins]);
  }
  if (source === "none") {
    return withoutTerms();
  }
  const matcher = new TermMatcher(
    terms,
    loadAllowedPhrases(join(findRepoRoot(), allowedPhrasesFile)),
  );
  const repo = values.repo;
  const since = values.full ? undefined : (values.since ?? scanSince(recentRuns(repo)));
  console.log(
    since === undefined
      ? "pr-comments: full scan of every pull request."
      : `pr-comments: scanning what was updated since ${since}.`,
  );
  const texts = [
    ...pullRequestTexts(repo, since),
    ...commentTexts(repo, "issues/comments", since),
    ...commentTexts(repo, "pulls/comments", since),
  ];
  const hits = findHits(texts, matcher, skippedLogins);
  console.log(
    `pr-comments: ${texts.length} texts scanned with ${matcher.size} terms, ${skippedLogins.length} login(s) skipped; ${hits.length} pull request(s) with a hit.`,
  );
  for (const hit of hits) {
    console.log(`  #${hit.pullRequest}: ${hit.links.map((link) => link.url).join(" ")}`);
  }
  if (values.apply && hits.length > 0) {
    const server = process.env["GITHUB_SERVER_URL"] ?? "https://github.com";
    const runUrl = `${server}/${repo}/actions/runs/${process.env["GITHUB_RUN_ID"] ?? ""}`;
    report(repo, hitsIssueBody(hits, runUrl));
  }
  return 0;
}

/** A gh failure prints only its first line: the rest could repeat a text it read. */
if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : "unknown error";
    console.error(`pr-comments: could not run (${message}).`);
    process.exitCode = 2;
  }
}
