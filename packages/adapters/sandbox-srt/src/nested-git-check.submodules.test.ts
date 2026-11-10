import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitlinkMode, index } from "./git-index.test-helper.ts";
import { type NestedGitSnapshot, snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "srt-nested-git-sub-"));
  await mkdir(join(work, ".git"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** Writes an index holding the gitlinks `paths` into the git folder `gitFolder`. */
async function writeIndex(gitFolder: string, paths: string[]): Promise<void> {
  await mkdir(join(work, gitFolder), { recursive: true });
  const entries = paths.map((path) => ({ path, mode: gitlinkMode }));
  await writeFile(join(work, gitFolder, "index"), index(entries));
}

/** A checked-out submodule `docs` the way `git submodule add` leaves one. */
async function addSubmodule(): Promise<void> {
  await writeIndex(".git", ["docs"]);
  await writeIndex(join(".git", "modules", "docs"), []);
  await mkdir(join(work, "docs"));
  await writeFile(join(work, "docs", ".git"), "gitdir: ../.git/modules/docs\n");
}

async function snapshot(): Promise<NestedGitSnapshot> {
  const taken = await snapshotNestedGit(work);
  if (taken === null) throw new Error("no snapshot");
  return taken;
}

verifies("sandbox-srt.session", () => {
  describe("undoing what the program planted in a submodule", () => {
    it("moves aside a submodule .git folder the program gave a commondir", async () => {
      await writeIndex(".git", ["docs"]);
      await writeIndex(join("docs", ".git"), []);
      const start = await snapshot();
      await writeFile(join(work, "docs", ".git", "commondir"), "../../evil\n");
      expect(await undoNestedGit(start)).toEqual({ undone: [join("docs", ".git")], failed: [] });
      expect(existsSync(join(work, "docs", ".git.halonic-blocked", "commondir"))).toBe(true);
    });

    it("moves aside a submodule .git file whose git folder the program gave a commondir", async () => {
      await addSubmodule();
      const start = await snapshot();
      await writeFile(join(work, ".git", "modules", "docs", "commondir"), "../../../evil\n");
      expect(await undoNestedGit(start)).toEqual({ undone: [join("docs", ".git")], failed: [] });
    });

    it("moves aside a nested repository the program added to a submodule's index", async () => {
      await addSubmodule();
      const start = await snapshot();
      await mkdir(join(work, "docs", "theme", ".git"), { recursive: true });
      await writeFile(join(work, "docs", "theme", ".git", "config"), "[core]\n\tfsmonitor = x\n");
      await writeIndex(join(".git", "modules", "docs"), ["theme"]);
      const theme = join("docs", "theme", ".git");
      expect(await undoNestedGit(start)).toEqual({ undone: [theme], failed: [] });
      expect(existsSync(join(work, "docs", ".git"))).toBe(true);
      expect(existsSync(join(work, theme))).toBe(false);
    });

    it("moves aside a submodule .git link the program pointed somewhere else", async () => {
      await writeIndex(".git", ["docs"]);
      await writeIndex(join(".git", "modules", "docs"), []);
      await mkdir(join(work, "docs"));
      await symlink(join("..", ".git", "modules", "docs"), join(work, "docs", ".git"));
      const start = await snapshot();
      await rm(join(work, "docs", ".git"));
      await symlink(join("..", "evil"), join(work, "docs", ".git"));
      expect(await undoNestedGit(start)).toEqual({ undone: [join("docs", ".git")], failed: [] });
    });

    it("leaves untouched submodules and their nested ones alone", async () => {
      await addSubmodule();
      await writeIndex(join(".git", "modules", "docs"), ["theme"]);
      await mkdir(join(work, "docs", "theme"));
      await writeFile(join(work, "docs", "theme", ".git"), "gitdir: ../../.git/modules/docs/x\n");
      expect(await undoNestedGit(await snapshot())).toEqual({ undone: [], failed: [] });
    });

    it("reports a submodule's index the program left unreadable", async () => {
      await addSubmodule();
      const start = await snapshot();
      await writeFile(join(work, ".git", "modules", "docs", "index"), "garbage");
      expect(await undoNestedGit(start)).toEqual({
        undone: [],
        failed: [join(".git", "modules", "docs", "index")],
      });
    });

    it("says which submodule's index can't be read at session start", async () => {
      await addSubmodule();
      await writeFile(join(work, ".git", "modules", "docs", "index"), "garbage");
      await expect(snapshotNestedGit(work)).rejects.toThrow(
        `can't read the git index in ${join(work, "docs")} (not a git index)`,
      );
    });

    it("reads each git folder once, so .git files pointing back can't loop", async () => {
      await writeIndex(".git", ["a"]);
      await mkdir(join(work, "a"));
      await writeFile(join(work, "a", ".git"), "gitdir: ../.git\n");
      expect([...(await snapshot()).dotGits.keys()]).toEqual(["a"]);
    });
  });
});
