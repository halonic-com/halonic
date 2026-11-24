import { execFileSync } from "node:child_process";
import { gitObjects } from "../guard/git-objects.ts";
import { signNote } from "../guard/sign-note.ts";
import { findRepoRoot } from "../lib/workspace.ts";
import { isSignableBase } from "./decision-base.ts";

const usage = "Usage: pnpm decision sign <pull request number>";

type Run = (command: string, ...args: string[]) => string;

/** Fetches a base branch other than main and returns its commit. */
function fetchBranch(run: Run, branch: string): string {
  run("git", "fetch", "--quiet", "--no-tags", "origin", `refs/heads/${branch}`);
  return run("git", "rev-parse", "FETCH_HEAD");
}

/**
 * pnpm decision sign <pull request number>
 *
 * Signs a pull request's decision note with the key in
 * PAPERCLIP_AGENT_PRIVATE_KEY (HAL-1337) and prints the `- Signature:` line
 * to add under the note's `- Kind:` line. A change to the guard's trust roots needs two guardians: the second adds their line under the first. When the signer's own line no longer matches, it says the new line replaces it. It runs only in a clean checkout
 * of origin/main, signs for a pull request into main or a release branch,
 * and reads the pull request from git's objects, so none of
 * the pull request's code, hooks or config runs while the key is loaded. It
 * never writes the key anywhere.
 */
function main(argv: readonly string[]): number {
  const number = Number(argv[1]);
  if (argv[0] !== "sign" || !Number.isSafeInteger(number) || number < 1) {
    console.error(usage);
    return 2;
  }
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
    run("gh", "pr", "view", String(number), "--json", "headRefName,headRefOid,baseRefName,url"),
  ) as { headRefName: string; headRefOid: string; baseRefName: string; url: string };
  const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/.exec(pr.url)?.[1];
  if (!isSignableBase(pr.baseRefName) || repo === undefined) {
    console.error(
      `decision: pull request ${number} doesn't merge into main or a release branch of a GitHub repo.`,
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
