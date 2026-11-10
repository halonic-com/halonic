import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileMode, gitlinkMode, index, type Link } from "./git-index.test-helper.ts";
import { gitlinkPaths, parseIndex } from "./git-index.ts";
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

const sharedId = "ab".repeat(20);

/** A split index the way `git update-index --split-index` leaves one: the gitlinks only in the shared index. */
async function writeSplitIndex(paths: string[], options = { shared: true }): Promise<void> {
  const shared = paths.map((path) => ({ path, mode: gitlinkMode }));
  if (options.shared) {
    await writeFile(join(work, ".git", `sharedindex.${sharedId}`), index(shared));
  }
  const link: Link = { id: sharedId };
  await writeFile(
    join(work, ".git", "index"),
    index([{ path: "README.md", mode: fileMode }], 2, 20, link),
  );
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
      expect(gitlinkPaths(parseIndex(bytes, 20), null)).toEqual([
        "a/very/long/dir/sub",
        "libs/acme",
      ]);
    });

    it("finds them with SHA-256 ids", () => {
      const bytes = index([{ path: "libs/acme", mode: gitlinkMode }], 2, 32);
      expect(gitlinkPaths(parseIndex(bytes, 32), null)).toEqual(["libs/acme"]);
    });

    describe("of a split index", () => {
      const shared = index([
        { path: "docs", mode: gitlinkMode },
        { path: "notes.md", mode: fileMode },
      ]);

      it("finds those in the shared index and in the index itself", () => {
        const split = index([{ path: "libs/acme", mode: gitlinkMode }], 2, 20, { id: sharedId });
        expect(parseIndex(split, 20).sharedIndex).toBe(`sharedindex.${sharedId}`);
        expect(gitlinkPaths(parseIndex(split, 20), parseIndex(shared, 20))).toEqual([
          "libs/acme",
          "docs",
        ]);
      });

      it("finds a shared entry the index replaced with a gitlink", () => {
        const split = index([{ path: "", mode: gitlinkMode }], 4, 20, {
          id: sharedId,
          replace: [1],
        });
        expect(gitlinkPaths(parseIndex(split, 20), parseIndex(shared, 20))).toEqual([
          "notes.md",
          "docs",
        ]);
      });

      it("refuses one whose replaced entry isn't in the shared index", () => {
        const split = index([{ path: "", mode: gitlinkMode }], 2, 20, {
          id: sharedId,
          replace: [70],
        });
        expect(() => gitlinkPaths(parseIndex(split, 20), parseIndex(shared, 20))).toThrow(
          "git index link is corrupt",
        );
      });

      it("refuses one without its shared index", () => {
        const split = index([{ path: "README.md", mode: fileMode }], 2, 20, { id: sharedId });
        expect(() => gitlinkPaths(parseIndex(split, 20), null)).toThrow(
          `the shared index sharedindex.${sharedId} is needed`,
        );
      });
    });

    it("refuses a file that is not an index", () => {
      expect(() => parseIndex(new TextEncoder().encode("not an index"), 20)).toThrow(
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

    it("moves aside the .git of a gitlink the program added through a split index", async () => {
      await writeIndex([]);
      const snapshot = await snapshotNestedGit(work);
      await plantRepository("sub");
      await writeSplitIndex(["sub"]);
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [join("sub", ".git")], failed: [] });
    });

    it("reports the index when the shared index it links to is missing", async () => {
      await writeIndex([]);
      const snapshot = await snapshotNestedGit(work);
      await plantRepository("sub");
      await writeSplitIndex(["sub"], { shared: false });
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [],
        failed: [join(".git", "index")],
      });
    });

    it("reports the index when the program put a folder in its place", async () => {
      await writeIndex([]);
      const snapshot = await snapshotNestedGit(work);
      await rm(join(work, ".git", "index"));
      await mkdir(join(work, ".git", "index"));
      if (snapshot === null) throw new Error("no snapshot");
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [],
        failed: [join(".git", "index")],
      });
    });

    it("says what to do when the index can't be read at session start", async () => {
      await writeFile(join(work, ".git", "index"), "garbage");
      await expect(snapshotNestedGit(work)).rejects.toThrow(
        `can't read the git index in ${work} (not a git index)`,
      );
    });

    it("refuses to start when the shared index of a split index is missing", async () => {
      await writeSplitIndex(["docs"], { shared: false });
      await expect(snapshotNestedGit(work)).rejects.toThrow(
        `the shared index sharedindex.${sharedId} is missing`,
      );
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

      it("moves aside a .git planted there when the index was split at start", async () => {
        await writeSplitIndex(["docs"]);
        const snapshot = await snapshotNestedGit(work);
        await writeFile(join(work, "docs", ".git"), "gitdir: .\n");
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
