import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  plainGit,
  repositoryWith,
  Scratch,
  testAuthor,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import { GitVcs } from "./vcs.ts";

// The contract suite covers what every Vcs does for Create version and
// proposal refs; these are git's own: what the port can't see.

const scratch = new Scratch();
afterAll(() => scratch.remove());

/** A repository with one commit holding `files`, and a worktrees folder outside it. */
async function repoWith(files: Record<string, string>) {
  const folder = await repositoryWith(scratch, files);
  const worktrees = join(await scratch.folder(), "worktrees");
  const runner = await testRunner(scratch);
  const vcs = new GitVcs(folder, { runner, author: testAuthor, worktrees });
  return { vcs, folder, files: new FolderDefinitionStore(folder) };
}

/** The files Halonic leaves in `.git` while it works: none may stay. */
async function leftInGitFolder(folder: string): Promise<string[]> {
  return (await readdir(join(folder, ".git"))).filter((name) => name.startsWith("halonic-"));
}

verifies("git.commit-version", () => {
  describe("commitVersion", () => {
    it("keeps a private entry HEAD tracks at its HEAD content, never dropping it", async () => {
      const { vcs, folder, files } = await repoWith({ "a.yaml": "1\n" });
      await writeFiles(folder, { ".env": "KEY=committed\n" });
      await plainGit(folder, ["add", "--force", "--", ".env"]);
      await plainGit(folder, ["commit", "--quiet", "--message=Commit .env"]);
      await writeFiles(folder, { ".env": "KEY=changed\n" });
      await files.write("a.yaml", "2\n");

      const version = await vcs.commitVersion({ message: "Create version", exclude: [] });

      const atVersion = await plainGit(folder, ["show", `${version}:.env`]);
      expect(atVersion).toBe("KEY=committed\n");
      expect(await leftInGitFolder(folder)).toEqual([]);
    });

    it("commits with the author it was given and no signature, whatever the config says", async () => {
      const { vcs, folder, files } = await repoWith({ "a.yaml": "1\n" });
      await plainGit(folder, ["config", "--local", "commit.gpgSign", "true"]);
      await files.write("a.yaml", "2\n");

      const version = await vcs.commitVersion({ message: "Create version", exclude: [] });

      const author = await plainGit(folder, ["log", "-1", "--format=%an <%ae>|%G?", version]);
      expect(author.trim()).toBe(`${testAuthor.name} <${testAuthor.email}>|N`);
    });

    it("refuses an empty include, and changes nothing", async () => {
      const { vcs, files } = await repoWith({ "a.yaml": "1\n" });
      await files.write("a.yaml", "2\n");
      const before = await vcs.log(5);
      await expect(
        vcs.commitVersion({ message: "Create version", include: [], exclude: [] }),
      ).rejects.toThrow(RangeError);
      expect(await vcs.log(5)).toEqual(before);
    });
  });
});

verifies("git.proposal-refs", () => {
  describe("commitWorktreeTo, readRef and deleteRef", () => {
    it("keeps the proposal off every branch, and leaves no index copy behind", async () => {
      const { vcs, folder } = await repoWith({ "a.yaml": "1\n" });
      const [head] = await vcs.log(1);
      const worktree = await vcs.addWorktree(String(head?.hash));
      await new FolderDefinitionStore(worktree.path).write("a.yaml", "2\n");
      const ref = "refs/halonic/proposals/run-1";

      const proposal = await vcs.commitWorktreeTo(worktree.id, ref, { parent: String(head?.hash) });

      const branches = await plainGit(folder, ["branch", "--contains", proposal]);
      expect(branches).toBe("");
      const record = join(folder, ".git", "worktrees", worktree.id);
      expect((await readdir(record)).filter((name) => name.endsWith(".index"))).toEqual([]);
      expect(await plainGit(folder, ["log", "-1", "--format=%s", proposal])).toBe(
        `Proposal ${ref}\n`,
      );
    });

    it("reads the ref, never a tag of the same name", async () => {
      const { vcs, folder } = await repoWith({ "a.yaml": "1\n" });
      await plainGit(folder, ["tag", "refs/halonic/proposals/run-1"]);
      expect(await vcs.readRef("refs/halonic/proposals/run-1")).toBeNull();
      await expect(vcs.deleteRef("refs/halonic/proposals/run-1")).rejects.toThrow(
        "There is no ref",
      );
    });
  });
});
