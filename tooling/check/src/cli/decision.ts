import { execFileSync } from "node:child_process";
import { decisionNoteFile } from "../guard/decision-notes.ts";
import { gitObjects } from "../guard/git-objects.ts";
import { type SignedNote, signNote } from "../guard/sign-note.ts";
import type { GitObjects } from "../guard/signatures.ts";
import { findRepoRoot } from "../lib/workspace.ts";
import { isSignableBase } from "./decision-base.ts";
import { commitFile, withSignatureLine } from "./decision-push.ts";

const usage = "Usage: pnpm decision sign <pull request number> [--push]";

type Run = (command: string, ...args: string[]) => string;

interface PushTarget {
  readonly root: string;
  readonly run: Run;
  readonly git: GitObjects;
  readonly head: string;
  readonly branch: string;
}

/**
 * Adds the signature line to the note at the pull request's head, commits only
 * that as `halonic-dev` and pushes it to the pull request's branch without
 * force, so the push fails if the branch moved (HAL-17893). The reviewer then
 * approves the new head in the same run.
 */
function pushSignature(target: PushTarget, signed: Extract<SignedNote, { ok: true }>): number {
  const file = decisionNoteFile(target.branch);
  const note = target.git.readFile(target.head, file) ?? "";
  const text = withSignatureLine(note, signed.line, signed.replaces?.keyId);
  if (text === undefined) {
    console.error(`decision: not pushed: ${file} has no "- Kind:" line to sign under.`);
    return 1;
  }
  const commit = commitFile(target.root, target.head, file, text);
  target.run("git", "push", "--quiet", "origin", `${commit}:refs/heads/${target.branch}`);
  console.log(
    `Pushed the signature to ${target.branch} as ${commit}. Approve this head: ${commit.slice(0, 7)}.`,
  );
  return 0;
}

/** Fetches a base branch other than main and returns its commit. */
function fetchBranch(run: Run, branch: string): string {
  run("git", "fetch", "--quiet", "--no-tags", "origin", `refs/heads/${branch}`);
  return run("git", "rev-parse", "FETCH_HEAD");
}

/** `sign <number>` with an optional `--push`, or undefined for anything else. */
function parseArgs(argv: readonly string[]): { number: number; push: boolean } | undefined {
  const number = Number(argv[1]);
  const push = argv[2] === "--push";
  const valid =
    argv[0] === "sign" &&
    Number.isSafeInteger(number) &&
    number >= 1 &&
    argv.length === (push ? 3 : 2);
  return valid ? { number, push } : undefined;
}

/**
 * pnpm decision sign <pull request number> [--push]
 *
 * Signs a pull request's decision note with the key in
 * PAPERCLIP_AGENT_PRIVATE_KEY (HAL-1337) and prints the `- Signature:` line
 * to add under the note's `- Kind:` line. A change to the guard's trust roots needs two guardians: the second adds their line under the first. When the signer's own line no longer matches, it says the new line replaces it. It runs only in a clean checkout
 * of origin/main, signs for a pull request into main or a release branch,
 * and reads the pull request from git's objects, so none of
 * the pull request's code, hooks or config runs while the key is loaded. It
 * never writes the key anywhere. With `--push` it also adds the line to the
 * note and pushes that one commit to the pull request's branch.
 */
function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  if (args === undefined) {
    console.error(usage);
    return 2;
  }
  const { number, push } = args;
  const key = process.env["PAPERCLIP_AGENT_PRIVATE_KEY"];
  if (key === undefined || key === "") {
    console.error(
      "decision: PAPERCLIP_AGENT_PRIVATE_KEY isn't set; sign in your own Paperclip run.",
    );
    return 1;
  }
  const root = findRepoRoot();
  const run: Run = (command, ...args) =>
    execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  run("git", "fetch", "--quiet", "--no-tags", "origin", "main");
  const mainCommit = run("git", "rev-parse", "origin/main");
  if (
    run("git", "rev-parse", "HEAD") !== mainCommit ||
    run("git", "status", "--porcelain") !== ""
  ) {
    console.error(
      "decision: sign only from a clean worktree of origin/main: git worktree add --detach ../sign origin/main",
    );
    return 1;
  }
  const pr = JSON.parse(
    run(
      "gh",
      "pr",
      "view",
      String(number),
      "--json",
      "headRefName,headRefOid,baseRefName,url,isCrossRepository",
    ),
  ) as {
    headRefName: string;
    headRefOid: string;
    baseRefName: string;
    url: string;
    isCrossRepository: boolean;
  };
  const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/.exec(pr.url)?.[1];
  if (!isSignableBase(pr.baseRefName) || repo === undefined) {
    console.error(
      `decision: pull request ${number} doesn't merge into main or a release branch of a GitHub repo.`,
    );
    return 1;
  }
  if (push && pr.isCrossRepository) {
    console.error(
      `decision: pull request ${number} comes from a fork; sign without --push and give the author the line.`,
    );
    return 1;
  }
  const base = pr.baseRefName === "main" ? mainCommit : fetchBranch(run, pr.baseRefName);
  run("git", "fetch", "--quiet", "--no-tags", "origin", `refs/pull/${number}/head`);
  const git = gitObjects(root, (line) => console.error(`decision: ${line}...`));
  if (!git.hasCommit(pr.headRefOid)) {
    console.error(`decision: pull request ${number} moved while fetching; run this again.`);
    return 1;
  }
  const pull = { repo, number, head: pr.headRefOid, base };
  const signed = signNote(pull, pr.headRefName, git, key);
  if (!signed.ok) {
    console.error(`decision: not signed: ${signed.reason}.`);
    return 1;
  }
  console.log(`Signing exactly this text:\n\n${signed.text}`);
  if (push) {
    return pushSignature({ root, run, git, head: pr.headRefOid, branch: pr.headRefName }, signed);
  }
  if (signed.replaces === undefined) {
    console.log(`Add this line under the note's "- Kind:" line:\n\n${signed.line}`);
    return 0;
  }
  console.log(
    `Your old signature no longer matches this pull request. Replace your line that starts "- Signature: ed25519:${signed.replaces.keyId}:" with this line:\n\n${signed.line}`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
