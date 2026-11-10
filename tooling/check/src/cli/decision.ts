import { execFileSync } from "node:child_process";
import { gitObjects } from "../guard/git-objects.ts";
import { signNote } from "../guard/sign-note.ts";
import { findRepoRoot } from "../lib/workspace.ts";

const usage = "Usage: pnpm decision sign <pull request number>";

/**
 * pnpm decision sign <pull request number>
 *
 * Signs a pull request's decision note with the key in
 * PAPERCLIP_AGENT_PRIVATE_KEY (HAL-1337) and prints the `- Signature:` line
 * to add under the note's `- Kind:` line. It runs only in a clean checkout
 * of origin/main and reads the pull request from git's objects, so none of
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
  const run = (command: string, ...args: string[]): string =>
    execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  run("git", "fetch", "--quiet", "--no-tags", "origin", "main");
  const base = run("git", "rev-parse", "origin/main");
  if (run("git", "rev-parse", "HEAD") !== base || run("git", "status", "--porcelain") !== "") {
    console.error(
      "decision: sign only from a clean worktree of origin/main: git worktree add --detach ../sign origin/main",
    );
    return 1;
  }
  const pr = JSON.parse(
    run("gh", "pr", "view", String(number), "--json", "headRefName,headRefOid,baseRefName,url"),
  ) as { headRefName: string; headRefOid: string; baseRefName: string; url: string };
  const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/.exec(pr.url)?.[1];
  if (pr.baseRefName !== "main" || repo === undefined) {
    console.error(`decision: pull request ${number} doesn't merge into main of a GitHub repo.`);
    return 1;
  }
  run("git", "fetch", "--quiet", "--no-tags", "origin", `refs/pull/${number}/head`);
  const git = gitObjects(root);
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
  console.log(`Add this line under the note's "- Kind:" line:\n\n${signed.line}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
