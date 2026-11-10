import { readdir, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  repositoryWith,
  Scratch,
  testAuthor,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { GitVcs } from "./vcs.ts";

// Ported from the memory Vcs's `vcs-versions.test.ts` (HAL-3245), so both
// adapters keep port v2 the same way until the contract suite has its
// version cases (HAL-3265). The cases about the index copy, `.env` and links
// are git's own.

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

/** A repository with one commit holding `files`. */
async function repoWith(
  files: Record<string, string>,
): Promise<{ vcs: GitVcs; files: FolderDefinitionStore; folder: string }> {
  const folder = await repositoryWith(scratch, files);
  const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
  return { vcs, files: new FolderDefinitionStore(folder), folder };
}

async function headOf(vcs: GitVcs): Promise<string> {
  const [commit] = await vcs.log(1);
  return commit?.hash ?? "";
}

verifies("git.vcs-versions", () => {
  describe("snapshot", () => {
    it("commits the files on disk, new ones included, and changes nothing else", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      await files.write("b.yaml", "new\n");
      const before = { status: await vcs.status(), log: await vcs.log(5) };

      const snapshot = await vcs.snapshot();

      expect(await vcs.readAt(snapshot, "a.yaml")).toBe("2\n");
      expect(await vcs.listAt(snapshot)).toEqual(["a.yaml", "b.yaml"]);
      expect(await vcs.status()).toEqual(before.status);
      expect(await vcs.log(5)).toEqual(before.log);
    });

    it("keeps what was on disk when the files change afterwards", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      const snapshot = await vcs.snapshot();
      await files.write("a.yaml", "3\n");
      expect(await vcs.readAt(snapshot, "a.yaml")).toBe("2\n");
    });

    it("works before the first commit, and the branch still has none", async () => {
      const folder = await scratch.folder();
      await writeFiles(folder, { "a.yaml": "1\n" });
      const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
      await vcs.init();
      const snapshot = await vcs.snapshot();
      expect(await vcs.readAt(snapshot, "a.yaml")).toBe("1\n");
      expect(await vcs.log(5)).toEqual([]);
    });

    it("keeps staged changes staged, and leaves no index copy behind", async () => {
      const { vcs, files, folder } = await repoWith({ "a.yaml": "1\n", "b.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      await vcs.stage(["a.yaml"]);
      await files.write("b.yaml", "2\n");
      const before = await vcs.status();

      await vcs.snapshot();

      expect(await vcs.status()).toEqual(before);
      expect(
        (await readdir(join(folder, ".git"))).filter((name) => name.includes("snapshot")),
      ).toEqual([]);
    });

    it("leaves out .env and ignored files, even when .gitignore lets .env in", async () => {
      const { vcs, folder } = await repoWith({ "a.yaml": "1\n", ".gitignore": "*.log\n" });
      await writeFiles(folder, { ".env": "KEY=placeholder\n", "run.log": "x\n" });
      expect(await vcs.listAt(await vcs.snapshot())).toEqual([".gitignore", "a.yaml"]);
    });

    it("refuses a folder that isn't a repository", async () => {
      const vcs = new GitVcs(await scratch.folder(), {
        runner: await runner(),
        author: testAuthor,
      });
      await expect(vcs.snapshot()).rejects.toThrow("isn't a git repository");
    });
  });

  describe("readAt and listAt", () => {
    it("read the commit, not the disk or the index", async () => {
      const { vcs, files } = await repoWith({ "agents/a.agent.yaml": "x\n" });
      const commit = await headOf(vcs);
      await files.write("agents/a.agent.yaml", "y\n");
      await vcs.stage(["agents/a.agent.yaml"]);
      expect(await vcs.readAt(commit, "agents/a.agent.yaml")).toBe("x\n");
    });

    it("give null for a file or folder the commit doesn't have", async () => {
      const { vcs } = await repoWith({ "agents/a.agent.yaml": "x\n", "w.workflow.yaml": "w\n" });
      const version = await headOf(vcs);
      expect(await vcs.readAt(version, "b.yaml")).toBeNull();
      expect(await vcs.readAt(version, "agents")).toBeNull();
      expect(await vcs.listAt(version, "missing")).toBeNull();
      expect(await vcs.listAt(version, "agents")).toEqual(["agents/a.agent.yaml"]);
    });

    it("give null for a link, which has no text, rather than the file it points to", async () => {
      const { vcs, folder } = await repoWith({ "a.yaml": "1\n" });
      await symlink("a.yaml", join(folder, "link.yaml"));
      const snapshot = await vcs.snapshot();
      expect(await vcs.readAt(snapshot, "link.yaml")).toBeNull();
      expect(await vcs.listAt(snapshot)).toEqual(["a.yaml"]);
    });

    it("refuse a version the repository doesn't have", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      const unknown = "0".repeat(40);
      await expect(vcs.readAt(unknown, "a.yaml")).rejects.toThrow(`Unknown version ${unknown}`);
      await expect(vcs.listAt(unknown)).rejects.toThrow(`Unknown version ${unknown}`);
    });

    it("refuse a version that isn't a full commit id, and a private path", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      await expect(vcs.readAt("HEAD", "a.yaml")).rejects.toThrow(RangeError);
      await expect(vcs.listAt("main")).rejects.toThrow(RangeError);
      await expect(vcs.readAt(await headOf(vcs), ".env")).rejects.toThrow(RangeError);
    });
  });

  describe("rename", () => {
    it("moves a tracked file with its history: it shows as a staged rename", async () => {
      const { vcs, files } = await repoWith({ "agents/old.agent.yaml": "x\n" });
      await vcs.rename("agents/old.agent.yaml", "agents/new.agent.yaml");
      expect(await files.read("agents/old.agent.yaml")).toBeNull();
      expect(await files.read("agents/new.agent.yaml")).toBe("x\n");
      expect((await vcs.status()).changes).toEqual([
        {
          path: "agents/new.agent.yaml",
          status: "renamed",
          staged: true,
          from: "agents/old.agent.yaml",
        },
      ]);
    });

    it("moves an untracked file, which stays untracked", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("notes.md", "n\n");
      await vcs.rename("notes.md", "docs/notes.md");
      expect((await vcs.status()).changes).toEqual([
        { path: "docs/notes.md", status: "untracked", staged: false },
      ]);
    });

    it("moves every file under a folder, untracked ones too", async () => {
      const { vcs, files, folder } = await repoWith({
        "hubs/p/a.yaml": "a\n",
        "hubs/p/b/c.yaml": "c\n",
      });
      await writeFiles(folder, { "hubs/p/new.yaml": "n\n" });
      await vcs.rename("hubs/p", "hubs/q");
      expect(await files.list()).toEqual(["hubs/q/a.yaml", "hubs/q/b/c.yaml", "hubs/q/new.yaml"]);
    });

    it.each([
      ["a.yaml", "b.yaml", "already exists"],
      ["missing.yaml", "c.yaml", "no missing.yaml"],
      ["hubs", "hubs/inner", "into itself"],
    ])("refuses %s -> %s and changes nothing", async (from, to, message) => {
      const { vcs, files, folder } = await repoWith({
        "a.yaml": "1\n",
        "b.yaml": "2\n",
        "hubs/x": "x\n",
      });
      const before = { files: await files.list(), status: await vcs.status() };
      await expect(vcs.rename(from, to)).rejects.toThrow(message);
      expect(await files.list()).toEqual(before.files);
      expect(await vcs.status()).toEqual(before.status);
      expect(await readFile(join(folder, "a.yaml"), "utf8")).toBe("1\n");
    });

    it("refuses a private path", async () => {
      const { vcs } = await repoWith({ "a.yaml": "1\n" });
      await expect(vcs.rename("a.yaml", ".env")).rejects.toThrow(RangeError);
    });
  });
});
