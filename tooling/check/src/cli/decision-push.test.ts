import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, test } from "vitest";
import { commitFile, withSignatureLine } from "./decision-push.ts";

const note = [
  "# Decision: retire the old timer rule",
  "",
  "- Approval: https://example.test/HAL-42",
  "- Kind: internal",
  "",
  "What changes and why.",
  "",
].join("\n");
const cto = "- Signature: ed25519:sha256:aaaa:c2lnbmVkLWJ5LWN0bw==";
const reviewer = "- Signature: ed25519:sha256:bbbb:c2lnbmVkLWJ5LXJldmlld2Vy";

verifies("check.decision-sign-push", () => {
  test("puts the first line under Kind", () => {
    expect(withSignatureLine(note, cto)?.split("\n").slice(3, 5)).toEqual([
      "- Kind: internal",
      cto,
    ]);
  });

  test("puts a second guardian's line under the first", () => {
    const signed = withSignatureLine(note, cto) ?? "";
    expect(withSignatureLine(signed, reviewer)?.split("\n").slice(3, 6)).toEqual([
      "- Kind: internal",
      cto,
      reviewer,
    ]);
  });

  test("replaces the signer's own old line", () => {
    const stale = withSignatureLine(note, "- Signature: ed25519:sha256:aaaa:b2xk") ?? "";
    expect(withSignatureLine(stale, cto, "sha256:aaaa")).toBe(withSignatureLine(note, cto));
  });

  test("refuses a note with no Kind line or no old line to replace", () => {
    expect(withSignatureLine("# Decision\n\nText.\n", cto)).toBeUndefined();
    expect(withSignatureLine(note, cto, "sha256:aaaa")).toBeUndefined();
  });

  let root = "";
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "decision-push-test-"));
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.name", "acme");
    git("config", "user.email", "acme@example.test");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(root, "note.md"), note);
    writeFileSync(join(root, "other.ts"), "export const other = 1;\n");
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", "head");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("commits only the note on top of the head as halonic-dev, leaving the worktree alone", () => {
    const head = git("rev-parse", "HEAD");
    const text = withSignatureLine(note, cto) ?? "";
    const commit = commitFile(root, head, "note.md", text);
    expect(git("rev-parse", `${commit}^`)).toBe(head);
    expect(git("diff", "--name-only", head, commit)).toBe("note.md");
    expect(git("show", `${commit}:note.md`)).toBe(text.trimEnd());
    expect(git("log", "-1", "--format=%an <%ae>", commit)).toBe(
      "halonic-dev <353861737+halonic-dev@users.noreply.github.com>",
    );
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(git("status", "--porcelain")).toBe("");
    expect(readFileSync(join(root, "note.md"), "utf8")).toBe(note);
  });

  test("a push of the commit fails once the branch has moved, since it never forces", () => {
    const head = git("rev-parse", "HEAD");
    const remote = mkdtempSync(join(tmpdir(), "decision-push-remote-"));
    try {
      execFileSync("git", ["init", "--quiet", "--bare", remote]);
      git("push", "--quiet", "--no-verify", remote, "HEAD:refs/heads/acme/HAL-1-x");
      const commit = commitFile(root, head, "note.md", withSignatureLine(note, cto) ?? "");
      writeFileSync(join(root, "other.ts"), "export const other = 2;\n");
      git("commit", "--quiet", "--no-verify", "-am", "moved");
      git("push", "--quiet", "--no-verify", remote, "HEAD:refs/heads/acme/HAL-1-x");
      expect(() =>
        execFileSync(
          "git",
          ["push", "--quiet", "--no-verify", remote, `${commit}:refs/heads/acme/HAL-1-x`],
          {
            cwd: root,
            stdio: "pipe",
          },
        ),
      ).toThrow();
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });
});
