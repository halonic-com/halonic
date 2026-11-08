import { execFileSync } from "node:child_process";

/**
 * The Developer Certificate of Origin sign-off (CONTRIBUTING.md):
 * every commit in a pull request carries a `Signed-off-by: Name <email>`
 * trailer for the address that authored it, as `git commit -s` writes it.
 */

/** What the DCO check needs to know about one commit. */
export interface CommitFacts {
  readonly hash: string;
  readonly subject: string;
  readonly authorName: string;
  readonly authorEmail: string;
  /** How many parents it has: a merge commit has two or more. */
  readonly parentCount: number;
  /** The values of its `Signed-off-by` trailers, such as `Ada <ada@example.com>`. */
  readonly signOffs: readonly string[];
}

/** A GitHub account whose commits a standing statement signs off. */
export interface CoveredAccount {
  readonly login: string;
  readonly email: string;
}

/**
 * The accounts in `docs/legal/dco-standing-statement.md`: Halonic
 * certifies the DCO for every commit they author, so those commits need
 * no `Signed-off-by` line. Change this list only together with that file.
 */
export const coveredAccounts: readonly CoveredAccount[] = [
  { login: "halonic-dev", email: "353861737+halonic-dev@users.noreply.github.com" },
];

/**
 * Whether the standing statement covers a commit: its author is a covered
 * account, and so is the GitHub account that opened the pull request. An
 * author address is easy to borrow; who opened the pull request isn't.
 */
export function coveredByStatement(
  commit: CommitFacts,
  pullRequestAuthor: string | undefined,
): boolean {
  const login = pullRequestAuthor?.toLowerCase();
  const author = commit.authorEmail.toLowerCase();
  return coveredAccounts.some(
    (account) => account.login.toLowerCase() === login && account.email.toLowerCase() === author,
  );
}

const signOffPattern = /^(?<name>[^<>]*\S)\s*<(?<email>[^<>\s]+@[^<>\s]+)>$/;

/** The email address of a sign-off value, or undefined when it isn't `Name <email>`. */
export function signOffEmail(value: string): string | undefined {
  return signOffPattern.exec(value.trim())?.groups?.["email"];
}

/**
 * Why a commit fails the DCO rule, or undefined when it passes.
 *
 * It passes when one of its sign-offs names the author's email address
 * (compared without regard to case; the name may be written differently).
 * Commits the standing statement covers pass without one (see
 * `coveredByStatement`). Merge commits are skipped: they bring no change
 * of their own, and GitHub's "Update branch" button writes them without a
 * sign-off.
 */
export function dcoProblem(commit: CommitFacts, pullRequestAuthor?: string): string | undefined {
  if (commit.parentCount > 1 || coveredByStatement(commit, pullRequestAuthor)) {
    return undefined;
  }
  const author = commit.authorEmail.toLowerCase();
  if (commit.signOffs.some((value) => signOffEmail(value)?.toLowerCase() === author)) {
    return undefined;
  }
  const what = `"${commit.subject}" by ${commit.authorName} <${commit.authorEmail}>`;
  const fix =
    "Sign off with `git commit -s` (or `git rebase --signoff <base branch>` for every commit on the branch); see CONTRIBUTING.md.";
  if (commit.signOffs.length === 0) {
    return `${what} has no "Signed-off-by:" line. ${fix}`;
  }
  return `${what} is signed off as ${commit.signOffs.join(", ")}, not as its author. The sign-off must name the author's email address. ${fix}`;
}

const field = "\u001f";
const record = "\u001e";
const valueSeparator = "\u001d";

/**
 * Reads the commits in `range` (`BASE..HEAD`) with git. Trailers are parsed
 * by git itself, so only a `Signed-off-by` in the message's last
 * paragraph counts, as for `git interpret-trailers`.
 */
export function readCommits(root: string, range: string): CommitFacts[] {
  const format = [
    "%H",
    "%P",
    "%an",
    "%ae",
    "%s",
    `%(trailers:key=Signed-off-by,valueonly,unfold,separator=%x1d)`,
  ].join("%x1f");
  const log = execFileSync("git", ["log", `--format=${format}%x1e`, range], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const commits: CommitFacts[] = [];
  for (const entry of log.split(record)) {
    const [
      hash = "",
      parents = "",
      authorName = "",
      authorEmail = "",
      subject = "",
      trailers = "",
    ] = entry.trim().split(field);
    if (hash === "") {
      continue;
    }
    commits.push({
      hash,
      subject,
      authorName,
      authorEmail,
      parentCount: parents.split(" ").filter((parent) => parent !== "").length,
      signOffs: trailers.split(valueSeparator).filter((value) => value.trim() !== ""),
    });
  }
  return commits;
}
