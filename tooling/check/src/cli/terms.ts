import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blobIdsOf, readCommits, readHistory } from "../lib/git-history.ts";
import { formatAnnotation, type Problem } from "../lib/problems.ts";
import { readPullRequestText } from "../lib/pull-request.ts";
import {
  loadAllowedPhrases,
  loadTerms,
  TermMatcher,
  termsEnvironmentVariable,
} from "../lib/terms.ts";
import { findRepoRoot, listRepoFiles } from "../lib/workspace.ts";

/**
 * The personal-terms guard (plan 11.1).
 *
 *   pnpm check:terms                    scan the working tree
 *   pnpm check:terms --range A..B       scan what a pull request adds: changed
 *                                       files, commit messages and authors in A..B,
 *                                       plus the branch, title and body of the
 *                                       pull request in $GITHUB_EVENT_PATH
 *   pnpm check:terms --all              scan the whole tree and the whole history:
 *                                       every commit, and every file and file
 *                                       name any commit ever had
 *
 * It prints where a protected term is, never the term.
 */

const notice =
  "matches a protected term. Remove or reword it; the term itself is never shown (plan 11.1).";

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isProbablyBinary(path: string): boolean {
  const sample = readFileSync(path).subarray(0, 8000);
  return sample.includes(0);
}

function scanFiles(
  root: string,
  files: readonly string[],
  matcher: TermMatcher,
  problems: Problem[],
): void {
  for (const actualFile of files) {
    // A path that contains a term would leak it, so its matching parts are withheld.
    const file = matcher.redactPath(actualFile);
    if (file !== actualFile) {
      problems.push({ rule: "terms", severity: "error", file, message: `The file name ${notice}` });
    }
    const path = join(root, actualFile);
    if (!existsSync(path) || isProbablyBinary(path)) {
      continue;
    }
    for (const line of matcher.matchingLines(readFileSync(path, "utf8"))) {
      problems.push({
        rule: "terms",
        severity: "error",
        file,
        line,
        message: `This line ${notice}`,
      });
    }
  }
}

function scanCommits(
  root: string,
  revisions: readonly string[],
  matcher: TermMatcher,
  problems: Problem[],
): void {
  for (const commit of readCommits(root, revisions)) {
    const short = commit.hash.slice(0, 10);
    if (matcher.matches(commit.author) || matcher.matches(commit.committer)) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: `commit ${short}`,
        message: `The author or committer ${notice}`,
      });
    }
    if (matcher.matches(commit.message)) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: `commit ${short}`,
        message: `The commit message ${notice}`,
      });
    }
  }
}

/**
 * Scans old file versions and old file names (plan 11.1): a term removed
 * from the tree is still public in history. The working-tree files were
 * scanned already, so their exact versions are skipped here.
 */
function scanHistory(
  root: string,
  current: readonly string[],
  matcher: TermMatcher,
  problems: Problem[],
): void {
  const history = readHistory(root, blobIdsOf(root, current));
  // Names in today's tree, folders included, were reported by scanFiles already.
  const currentPaths = new Set(
    current.flatMap((file) =>
      file.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/")),
    ),
  );
  for (const path of history.paths) {
    const shown = matcher.redactPath(path);
    if (shown !== path && !currentPaths.has(path)) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: `history: ${shown}`,
        message: `A file or folder name in history ${notice}`,
      });
    }
  }
  for (const { blob, path, content } of history.blobs) {
    if (content.subarray(0, 8000).includes(0)) {
      continue;
    }
    for (const line of matcher.matchingLines(content.toString("utf8"))) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: `history: ${matcher.redactPath(path)} (blob ${blob.slice(0, 10)})`,
        line,
        message: `This line of an old version ${notice} Find its commits with git log --all --find-object=${blob.slice(0, 10)}.`,
      });
    }
  }
}

/**
 * The pull request text comes from the event file, not from `env:`, because
 * GitHub prints a step's `env:` block in the public job log.
 */
function scanPullRequest(matcher: TermMatcher, problems: Problem[]): void {
  const pullRequest = readPullRequestText();
  const fields: [string, string | undefined][] = [
    ["branch name", pullRequest?.branch],
    ["pull request title", pullRequest?.title],
    ["pull request body", pullRequest?.body],
  ];
  for (const [label, value] of fields) {
    if (value !== undefined && matcher.matches(value)) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: label,
        message: `The ${label} ${notice}`,
      });
    }
  }
}

/** Why nothing was scanned: the list is missing, and why it is missing. */
function skipMessage(): string {
  const without = readPullRequestText()?.withoutSecrets;
  if (without !== undefined) {
    const who = without === "fork" ? "pull requests from forks" : "Dependabot's pull requests";
    return `terms: SKIPPED. GitHub doesn't give Actions secrets to ${who}, so the ${termsEnvironmentVariable} list isn't available here and nothing was scanned. The merge queue scans the change with the secret before it can reach main (plan 11.1).`;
  }
  return `terms: SKIPPED. The ${termsEnvironmentVariable} Actions secret is not set yet, so nothing was scanned. Set it on the halonic-com organisation to turn the guard on (plan 11.1).`;
}

function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  const { terms, source } = loadTerms();
  const matcher = new TermMatcher(terms, loadAllowedPhrases(root));
  if (matcher.isEmpty) {
    // Until the secret exists the guard skips loudly instead of failing, so
    // work can start; the notice shows on every run (plan 11.1, 16.4).
    const message = skipMessage();
    console.log(process.env["GITHUB_ACTIONS"] ? `::warning title=terms::${message}` : message);
    return 0;
  }
  const problems: Problem[] = [];
  const rangeIndex = argv.indexOf("--range");
  if (argv.includes("--all")) {
    const files = listRepoFiles(root);
    scanFiles(root, files, matcher, problems);
    scanCommits(root, ["--all"], matcher, problems);
    scanHistory(root, files, matcher, problems);
  } else if (rangeIndex !== -1) {
    const range = argv[rangeIndex + 1] ?? "";
    if (!/^[\w./-]+\.\.[\w./-]+$/.test(range)) {
      console.error(`--range needs BASE..HEAD, got "${range}".`);
      return 2;
    }
    const changed = git(root, [
      "diff",
      "--name-only",
      "--diff-filter=d",
      "-z",
      range.replace("..", "..."),
    ]);
    scanFiles(
      root,
      changed.split("\0").filter((file) => file !== ""),
      matcher,
      problems,
    );
    scanCommits(root, [range], matcher, problems);
    scanPullRequest(matcher, problems);
  } else {
    scanFiles(root, listRepoFiles(root), matcher, problems);
  }
  for (const problem of problems) {
    const location = problem.line === undefined ? problem.file : `${problem.file}:${problem.line}`;
    console.log(
      process.env["GITHUB_ACTIONS"] ? formatAnnotation(problem) : `${location}: ${problem.message}`,
    );
  }
  console.log(
    `terms: ${problems.length === 0 ? "clean" : `${problems.length} finding(s)`} (list from ${source}).`,
  );
  return problems.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch {
  // An error can carry git output (commit messages) or the terms, so none of it is printed.
  console.error(
    "terms: the guard failed before it finished. Run it locally to see why; no details are printed here (plan 11.1).",
  );
  process.exitCode = 2;
}
