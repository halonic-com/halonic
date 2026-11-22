import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitChanges, stagedChanges, treeChanges } from "./git-changes.ts";
import type { Change } from "./scan.ts";

/**
 * The readers against a real throwaway repo: whatever a commit or file
 * holds, its text reaches the scanner.
 */

// Real git processes; on a loaded runner one can take several seconds.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const marker = "line the scanner must see";

let repo = "";

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_CONFIG_GLOBAL: join(repo, ".git", "test-global-config"),
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

function commit(message: string): void {
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", message);
}

/** Every line text the change set holds for one file. */
function textsOf(changes: readonly Change[], path: string): string[] {
  return changes.flatMap((change) =>
    change.files
      .filter((file) => file.path === path)
      .flatMap((file) => file.lines.map((line) => line.text)),
  );
}

function utf16(text: string, order: "le" | "be"): Buffer {
  const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  return order === "le" ? little : Buffer.from(little).swap16();
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "leak-guard-changes-"));
  git("init", "-q", "-b", "main");
  commit("start");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("commitChanges", () => {
  it("reads a commit's files whatever control characters its message holds", () => {
    writeFileSync(join(repo, "notes.md"), `${marker}\n`);
    commit("a message with \u001f and \u001ecommit in it");
    const changes = commitChanges(repo, ["HEAD~1..HEAD"]);
    expect(changes).toHaveLength(1);
    expect(textsOf(changes, "notes.md")).toEqual([marker]);
    expect(changes[0]?.texts[0]?.text).toContain("in it");
  });

  it("reads a file that replaced a link of the same name", () => {
    symlinkSync("elsewhere", join(repo, "settings.txt"));
    commit("a link");
    unlinkSync(join(repo, "settings.txt"));
    writeFileSync(join(repo, "settings.txt"), `${marker}\n`);
    commit("a file");
    expect(textsOf(commitChanges(repo, ["HEAD~1..HEAD"]), "settings.txt")).toEqual([marker]);
  });

  it("decodes a UTF-16 file a commit adds", () => {
    writeFileSync(join(repo, "wide.txt"), utf16(`first\n${marker} é\n`, "le"));
    commit("wide text");
    expect(textsOf(commitChanges(repo, ["HEAD~1..HEAD"]), "wide.txt")).toContain(`${marker} é`);
  });

  it("reads a file with NUL bytes a commit adds", () => {
    writeFileSync(join(repo, "data.bin"), Buffer.concat([Buffer.from([0]), Buffer.from(marker)]));
    commit("data");
    expect(textsOf(commitChanges(repo, ["HEAD~1..HEAD"]), "data.bin")).toContain(marker);
  });
});

describe("stagedChanges", () => {
  it("decodes a staged UTF-16 big-endian file", () => {
    writeFileSync(join(repo, "wide.txt"), utf16(`${marker}\n`, "be"));
    git("add", "wide.txt");
    expect(textsOf(stagedChanges(repo), "wide.txt")).toContain(marker);
  });
});

describe("treeChanges", () => {
  it("reads every tracked file: NUL bytes early on, UTF-16 in either byte order", () => {
    writeFileSync(
      join(repo, "data.bin"),
      Buffer.concat([Buffer.alloc(100), Buffer.from(`\n${marker}\n`)]),
    );
    writeFileSync(join(repo, "little.txt"), utf16(`${marker}\n`, "le"));
    writeFileSync(join(repo, "big.txt"), utf16(`${marker}\n`, "be"));
    commit("files");
    const changes = treeChanges(repo);
    for (const path of ["data.bin", "little.txt", "big.txt"]) {
      expect(textsOf(changes, path)).toContain(marker);
    }
  });
});
