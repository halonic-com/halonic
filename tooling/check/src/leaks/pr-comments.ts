import type { TermMatcher } from "./terms.ts";

/**
 * The scheduled scan of what people write on pull requests (HAL-20064):
 * their bodies, comments, review bodies and review comments. The leak guard
 * checks a pull request's title, body and commits when it changes, but a
 * comment can't be checked before it is posted, so a daily scan finds them
 * afterwards. It reports only pull request numbers and links, never the
 * text that matched.
 */

/** One piece of text on a pull request. */
export interface PullRequestText {
  readonly pullRequest: number;
  readonly kind: "body" | "comment" | "review" | "review comment";
  /** Where to read it on GitHub. */
  readonly url: string;
  /** The author's login; empty when the account was deleted. */
  readonly author: string;
  readonly text: string;
}

/** A pull request with personal terms, and where they are. */
export interface PullRequestHit {
  readonly pullRequest: number;
  readonly links: readonly { readonly kind: PullRequestText["kind"]; readonly url: string }[];
}

/** The title of the one issue the scan opens and updates. */
export const hitsIssueTitle = "Personal terms in pull request comments";

/** The pull requests whose texts hold a term, by number; texts by a skipped author left out. */
export function findHits(
  texts: readonly PullRequestText[],
  matcher: TermMatcher,
  skippedAuthors: readonly string[],
): PullRequestHit[] {
  const skipped = new Set(skippedAuthors.map((login) => login.toLowerCase()));
  const hits = new Map<number, PullRequestHit["links"][number][]>();
  for (const text of texts) {
    if (skipped.has(text.author.toLowerCase()) || !matcher.matches(text.text)) {
      continue;
    }
    const links = hits.get(text.pullRequest) ?? [];
    if (!links.some((link) => link.url === text.url)) {
      links.push({ kind: text.kind, url: text.url });
    }
    hits.set(text.pullRequest, links);
  }
  return [...hits.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pullRequest, links]) => ({ pullRequest, links }));
}

/** Parses the comma- or line-separated list of logins whose texts are not scanned. */
export function parseLogins(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((login) => login.trim())
    .filter((login) => login !== "");
}

/** The issue text: pull request numbers and links only, never the matched text. */
export function hitsIssueBody(hits: readonly PullRequestHit[], runUrl: string): string {
  const lines = hits.map(
    (hit) =>
      `- #${hit.pullRequest}: ${hit.links.map((link) => `[${link.kind}](${link.url})`).join(", ")}`,
  );
  return [
    `The scheduled scan found personal terms on ${hits.length} pull request(s) (${runUrl}).`,
    'Edit each text so it says "the board" instead, then close this issue. See docs/guides/leak-guard.md.',
    "",
    ...lines,
  ].join("\n");
}

/** A finished run of the scheduled workflow, with its scan job's result. */
export interface ScanRun {
  readonly startedAt: string;
  readonly scanSucceeded: boolean;
}

/**
 * Where an incremental scan starts: when the newest run whose scan
 * succeeded started, so nothing updated while it ran is missed. Undefined
 * when there is none, which means a full scan.
 */
export function scanSince(runs: readonly ScanRun[]): string | undefined {
  const succeeded = runs
    .filter((run) => run.scanSucceeded)
    .map((run) => run.startedAt)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return succeeded[0];
}
