import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitlinkPaths } from "./git-index.ts";
import { snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";

const fileMode = 0o100644;
const gitlinkMode = 0o160000;

/** A git index the way git writes one, with entries in the given order. */
function index(
  entries: { path: string; mode: number; extended?: boolean }[],
  version: 2 | 3 | 4 = 2,
  hashLength = 20,
): Uint8Array {
  const parts: number[] = [
    ...new TextEncoder().encode("DIRC"),
    ...u32(version),
    ...u32(entries.length),
  ];
  let previous = "";
  for (const entry of entries) {
    const start = parts.length;
    parts.push(...new Array(24).fill(0), ...u32(entry.mode), ...new Array(12).fill(0));
    parts.push(...new Array(hashLength).fill(7));
    const name = new TextEncoder().encode(entry.path);
    const flags = Math.min(name.byteLength, 0xfff) | (entry.extended ? 0x4000 : 0);
    parts.push(flags >> 8, flags & 0xff);
    if (entry.extended) parts.push(0x20, 0);
    if (version === 4) {
      let shared = 0;
      while (shared < previous.length && previous[shared] === entry.path[shared]) shared++;
      parts.push(
        previous.length - shared,
        ...new TextEncoder().encode(entry.path.slice(shared)),
        0,
      );
    } else {
      parts.push(...name, 0);
      while ((parts.length - start) % 8 !== 0) parts.push(0);
    }
    previous = entry.path;
  }
  return new Uint8Array(parts);
}

function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

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
      expect(await undoNestedGit(snapshot)).toEqual({ undone: ["sub"], failed: [] });
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
      expect(await undoNestedGit(snapshot)).toEqual({ undone: ["docs"], failed: [] });
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
        expect(await undoNestedGit(snapshot)).toEqual({ undone: [], failed: ["libs/sub"] });
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
      expect(await undoNestedGit(snapshot)).toEqual({ undone: [], failed: ["../elsewhere"] });
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

    it("records nothing when the working folder's .git is not a folder", async () => {
      await rm(join(work, ".git"), { recursive: true });
      await writeFile(join(work, ".git"), "gitdir: /elsewhere\n");
      expect(await snapshotNestedGit(work)).toBeNull();
    });
  });
});
