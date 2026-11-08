import { execFileSync } from "node:child_process";

/**
 * Works out what a `git push` sends. Git hands the pre-push hook one line
 * per ref: `<local ref> <local sha> <remote ref> <remote sha>`.
 */

const noCommit = /^0+$/;

function isKnownCommit(root: string, sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The `git log` revisions for the commits a push sends that the remote
 * doesn't have yet. A deleted ref sends nothing. For a new branch, or when
 * the remote moved on to a commit we don't have, it is every commit not
 * already on one of the remote's branches.
 *
 * @param refLines - what git wrote to the hook's standard input
 * @param remote - the remote's name, the hook's first argument
 */
export function pushedRevisions(root: string, refLines: string, remote: string): string[][] {
  const revisions: string[][] = [];
  for (const line of refLines.split("\n")) {
    const [, localSha = "", , remoteSha = ""] = line.trim().split(/\s+/);
    if (localSha === "" || noCommit.test(localSha)) {
      continue;
    }
    if (noCommit.test(remoteSha) || !isKnownCommit(root, remoteSha)) {
      revisions.push([localSha, "--not", `--remotes=${remote}`]);
    } else {
      revisions.push([`${remoteSha}..${localSha}`]);
    }
  }
  return revisions;
}
