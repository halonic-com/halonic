import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileMode, gitlinkMode, index } from "./git-index.test-helper.ts";
import { gitlinkPaths } from "./git-index.ts";
import { snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "srt-nested-git-"));
  await mkdir(join(work, ".git"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function writeIndex(paths: string[]): Promise<void> {
  const entries = [
    { path: "README.md", mode: fileMode },
    ...paths.map((path) => ({ path, mode: gitlinkMode })),
  ];
  await writeFile(join(work, ".git", "index"), index(entries));
}

/** A nested repository the way a program would plant one: its own settings in `<path>/.git`. */
async function plantRepository(path: string): Promise<void> {
  await mkdir(join(work, path, ".git"), { recursive: true });
  await writeFile(join(work, path, ".git", "config"), "[core]\n\tfsmonitor = touch pwned\n");
}

verifies("sandbox-srt.session", () => {
  describe("reading the gitlinks of a git index", () => {
    it.each([2, 3, 4] as const)("finds them in index version %i", (version) => {
      const bytes = index(
        [
          { path: "a/very/long/dir/f1", mode: fileMode },
          { path: "a/very/long/dir/sub", mode: gitlinkMode, extended: version !== 2 },
          { path: "libs/acme", mode: gitlinkMode },
          { path: "zz", mode: fileMode },
        ],
        version,
      );
      expect(gitlinkPaths(bytes, 20)).toEqual(["a/very/long/dir/sub", "libs/acme"]);
    });

    it("finds them with SHA-256 ids", () => {
      const bytes = index([{ path: "libs/acme", mode: gitlinkMode }], 2, 32);
      expect(gitlinkPaths(bytes, 32)).toEqual(["libs/acme"]);
    });

    it("refuses a file that is not an index", () => {
      expect(() => gitlinkPaths(new TextEncoder().encode("not an index"), 20)).toThrow(
        "not a git index",
      );
    });
  });

  describe("undoing a nested repository the program planted", () => {
    it("moves aside the .git of a gitlink the program added", async () => {
      await writeIndex([]);
      const snapshot = await snapshotNestedGit(work);
      await plantRepository("sub");
      await writeIndex(["sub"]);
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [join("sub", ".git")], failed: [] });
      expect(existsSync(join(work, "sub", ".git"))).toBe(false);
      expect(await readFile(join(work, "sub", ".git.halonic-blocked", "config"), "utf8")).toContain(
        "fsmonitor",
      );
    });

    it("moves aside a .git file the program pointed somewhere else", async () => {
      await mkdir(join(work, "docs"));
      await writeFile(join(work, "docs", ".git"), "gitdir: ../.git/modules/docs\n");
      await writeIndex(["docs"]);
      const snapshot = await snapshotNestedGit(work);
      await writeFile(join(work, "docs", ".git"), "gitdir: ../evil\n");
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [join("docs", ".git")], failed: [] });
      expect(await readFile(join(work, "docs", ".git.halonic-blocked"), "utf8")).toBe(
        "gitdir: ../evil\n",
      );
    });

    it("leaves a submodule alone that the program did not touch", async () => {
      await mkdir(join(work, "docs"));
      await writeFile(join(work, "docs", ".git"), "gitdir: ../.git/modules/docs\n");
      await writeIndex(["docs"]);
      const snapshot = await snapshotNestedGit(work);
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [], failed: [] });
      expect(existsSync(join(work, "docs", ".git"))).toBe(true);
    });

    it("never follows a link the program put on the way to a gitlink", async () => {
      const outside = await mkdtemp(join(tmpdir(), "srt-nested-git-outside-"));
      try {
        await writeIndex([]);
        const snapshot = await snapshotNestedGit(work);
        await mkdir(join(outside, "sub", ".git"), { recursive: true });
        await symlink(outside, join(work, "libs"));
        await writeIndex(["libs/sub"]);
        if (snapshot === null) throw new Error("no snapshot");
        expect(await undoNestedGit(snapshot)).toEqual({
          undone: [],
          failed: [join("libs/sub", ".git")],
        });
        expect(existsSync(join(outside, "sub", ".git"))).toBe(true);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it("reports a gitlink path that leaves the working folder as not undone", async () => {
      await writeIndex([]);
      const snapshot = await snapshotNestedGit(work);
      await writeIndex(["../elsewhere"]);
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [],
        failed: [join("../elsewhere", ".git")],
      });
    });

    it("reports the index when the program left one that can't be read", async () => {
      await writeIndex([]);
      const snapshot = await snapshotNestedGit(work);
      await writeFile(join(work, ".git", "index"), "garbage");
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [],
        failed: [join(".git", "index")],
      });
    });

    describe("in a submodule that is not checked out at session start", () => {
      beforeEach(async () => {
        await mkdir(join(work, "docs"));
        await writeIndex(["docs"]);
      });

      it("moves aside a .git file the program wrote there", async () => {
        const snapshot = await snapshotNestedGit(work);
        await writeFile(join(work, "docs", ".git"), "gitdir: .\n");
        if (snapshot === null) throw new Error("no snapshot");
        expect(await undoNestedGit(snapshot)).toEqual({
          undone: [join("docs", ".git")],
          failed: [],
        });
        expect(existsSync(join(work, "docs", ".git"))).toBe(false);
        expect(await readFile(join(work, "docs", ".git.halonic-blocked"), "utf8")).toBe(
          "gitdir: .\n",
        );
      });

      it("moves aside a .git folder the program made there", async () => {
        const snapshot = await snapshotNestedGit(work);
        await plantRepository("docs");
        if (snapshot === null) throw new Error("no snapshot");
        expect(await undoNestedGit(snapshot)).toEqual({
          undone: [join("docs", ".git")],
          failed: [],
        });
        expect(existsSync(join(work, "docs", ".git"))).toBe(false);
      });

      it("still moves it aside when the program also took the gitlink out of the index", async () => {
        const snapshot = await snapshotNestedGit(work);
        await plantRepository("docs");
        await writeIndex([]);
        if (snapshot === null) throw new Error("no snapshot");
        expect(await undoNestedGit(snapshot)).toEqual({
          undone: [join("docs", ".git")],
          failed: [],
        });
      });

      it("still moves it aside when the program also broke the index", async () => {
        const snapshot = await snapshotNestedGit(work);
        await plantRepository("docs");
        await writeFile(join(work, ".git", "index"), "garbage");
        if (snapshot === null) throw new Error("no snapshot");
        expect(await undoNestedGit(snapshot)).toEqual({
          undone: [join("docs", ".git")],
          failed: [join(".git", "index")],
        });
      });
    });

    it("records nothing when the working folder's .git is not a folder", async () => {
      await rm(join(work, ".git"), { recursive: true });
      await writeFile(join(work, ".git"), "gitdir: /elsewhere\n");
      expect(await snapshotNestedGit(work)).toBeNull();
    });
  });
});
