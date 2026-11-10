import { lstat, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  plainGit,
  repositoryWith,
  Scratch,
  testAuthor,
  testRunner,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { Repository } from "./repository.ts";
import { GitVcs } from "./vcs.ts";

// Links at the top of `.git` that lead outside the git folder (HAL-3986,
// HAL-4017): git follows them, so each one is refused before any call.

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

verifies("git.repository", () => {
  describe("links in the git folder", () => {
    // Moved out and linked back, the repository looks the same to git, which
    // then reads and writes outside: another repository's objects or refs.
    for (const name of ["objects", "refs", "logs", "info", "index", "packed-refs"]) {
      it(`refuses a link from .git/${name} to outside the folder`, async () => {
        const folder = await repositoryWith(scratch);
        await plainGit(folder, ["pack-refs", "--all"]);
        const inGit = join(folder, ".git", name);
        const outside = join(await scratch.folder(), name);
        const exists = await lstat(inGit).then(
          () => true,
          () => false,
        );
        if (exists) await rename(inGit, outside);
        else await mkdir(outside);
        await symlink(outside, inGit);
        await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");
      });
    }

    it("refuses a link inside .git that leads nowhere yet", async () => {
      const folder = await repositoryWith(scratch);
      await rm(join(folder, ".git", "logs"), { recursive: true });
      await symlink(join(await scratch.folder(), "logs"), join(folder, ".git", "logs"));
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");
    });

    // git writes these through the link: `commit` the message, `pull` what it fetched.
    for (const name of ["COMMIT_EDITMSG", "FETCH_HEAD"]) {
      it(`refuses a link from .git/${name} to a file outside`, async () => {
        const folder = await repositoryWith(scratch);
        const outside = join(await scratch.folder(), name);
        await writeFile(outside, "kept\n");
        await rm(join(folder, ".git", name), { force: true });
        await symlink(outside, join(folder, ".git", name));
        const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
        await writeFile(join(folder, "a.yaml"), "2\n");
        await expect(vcs.stage(["a.yaml"])).rejects.toThrow("outside the folder");
        await expect(vcs.commit("Overwrite")).rejects.toThrow("outside the folder");
        expect(await readFile(outside, "utf8")).toBe("kept\n");
      });
    }

    it("allows a link inside .git that stays in the git folder", async () => {
      const folder = await repositoryWith(scratch);
      await rename(join(folder, ".git", "objects"), join(folder, ".git", "objects-real"));
      await symlink(join(folder, ".git", "objects-real"), join(folder, ".git", "objects"));
      const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
      await writeFile(join(folder, "a.yaml"), "2\n");
      await vcs.stage(["a.yaml"]);
      await expect(vcs.commit("Change a")).resolves.toMatch(/^[0-9a-f]{40}$/u);
    });
  });
});
