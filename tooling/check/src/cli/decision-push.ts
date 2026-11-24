import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const signatureLinePattern = /^\s*-\s*Signature\s*:/;

/** The shared account every agent commits as (root `AGENTS.md`). */
const author = {
  GIT_AUTHOR_NAME: "halonic-dev",
  GIT_AUTHOR_EMAIL: "353861737+halonic-dev@users.noreply.github.com",
  GIT_COMMITTER_NAME: "halonic-dev",
  GIT_COMMITTER_EMAIL: "353861737+halonic-dev@users.noreply.github.com",
};

/**
 * The note with a signature line added where the note format wants it: in
 * place of the signer's own old line when `replacesKeyId` names it, under the
 * last signature line when the note has one (a second guardian), otherwise
 * under the `- Kind:` line. Returns undefined when there is no such line.
 */
export function withSignatureLine(
  note: string,
  line: string,
  replacesKeyId?: string,
): string | undefined {
  const lines = note.split("\n");
  if (replacesKeyId !== undefined) {
    const own = lines.findIndex(
      (each) => signatureLinePattern.test(each) && each.includes(`ed25519:${replacesKeyId}:`),
    );
    if (own === -1) {
      return undefined;
    }
    return [...lines.slice(0, own), line, ...lines.slice(own + 1)].join("\n");
  }
  const lastSignature = lines.findLastIndex((each) => signatureLinePattern.test(each));
  const anchor =
    lastSignature === -1 ? lines.findIndex((each) => /^\s*-\s*Kind\s*:/.test(each)) : lastSignature;
  if (anchor === -1) {
    return undefined;
  }
  return [...lines.slice(0, anchor + 1), line, ...lines.slice(anchor + 1)].join("\n");
}

/**
 * Commits `text` as `file` on top of `head` as `halonic-dev`, with nothing
 * else changed, and returns the new commit. It works only on git's objects,
 * through a temporary index, so the worktree stays as it is and none of the
 * pull request's files, hooks or config are checked out or run.
 */
export function commitFile(root: string, head: string, file: string, text: string): string {
  const folder = mkdtempSync(join(tmpdir(), "decision-push-"));
  try {
    const env = { ...process.env, ...author, GIT_INDEX_FILE: join(folder, "index") };
    const git = (args: readonly string[], input?: string): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", env, input }).trim();
    const mode = git(["ls-tree", head, "--", file]).split(/\s/)[0] || "100644";
    const blob = git(["hash-object", "-w", "--stdin"], text);
    git(["read-tree", head]);
    git(["update-index", "--add", "--cacheinfo", `${mode},${blob},${file}`]);
    const tree = git(["write-tree"]);
    // Both the variables and the config: a git wrapper may set the author
    // from config, and plain git lets the variables win.
    return git([
      ...[
        "-c",
        `user.name=${author.GIT_AUTHOR_NAME}`,
        "-c",
        `user.email=${author.GIT_AUTHOR_EMAIL}`,
      ],
      ...["commit-tree", tree, "-p", head, "-m", `docs(decisions): sign ${file}`],
    ]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
