import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatAnnotation, type Problem } from "../lib/problems.ts";
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
 *                                       plus BRANCH_NAME, PR_TITLE and PR_BODY
 *   pnpm check:terms --all              scan the whole tree and the whole history
 *
 * It prints where a protected term is, never the term.
 */

const notice =
  "matches a protected term. Remove or reword it; the term itself is never shown (plan 11.1).";

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
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
  const separator = "\u001e";
  const log = git(root, ["log", `--format=%H%n%an <%ae>%n%cn <%ce>%n%B${separator}`, ...revisions]);
  for (const entry of log.split(separator)) {
    const [hash = "", author = "", committer = "", ...message] = entry.trim().split("\n");
    if (hash === "") {
      continue;
    }
    const short = hash.slice(0, 10);
    if (matcher.matches(author) || matcher.matches(committer)) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: `commit ${short}`,
        message: `The author or committer ${notice}`,
      });
    }
    if (matcher.matches(message.join("\n"))) {
      problems.push({
        rule: "terms",
        severity: "error",
        file: `commit ${short}`,
        message: `The commit message ${notice}`,
      });
    }
  }
}

function scanPullRequest(matcher: TermMatcher, problems: Problem[]): void {
  const fields: [string, string | undefined][] = [
    ["branch name", process.env["BRANCH_NAME"]],
    ["pull request title", process.env["PR_TITLE"]],
    ["pull request body", process.env["PR_BODY"]],
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

function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  const { terms, source } = loadTerms();
  const matcher = new TermMatcher(terms, loadAllowedPhrases(root));
  if (matcher.isEmpty) {
    // Until the secret exists the guard skips loudly instead of failing, so
    // work can start; the notice shows on every run (plan 11.1, 16.4).
    const message = `terms: SKIPPED. The ${termsEnvironmentVariable} Actions secret is not set yet, so nothing was scanned. Set it on the halonic-com organisation to turn the guard on (plan 11.1).`;
    console.log(process.env["GITHUB_ACTIONS"] ? `::warning title=terms::${message}` : message);
    return 0;
  }
  const problems: Problem[] = [];
  const rangeIndex = argv.indexOf("--range");
  if (argv.includes("--all")) {
    scanFiles(root, listRepoFiles(root), matcher, problems);
    scanCommits(root, ["--all"], matcher, problems);
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

process.exitCode = main(process.argv.slice(2));
