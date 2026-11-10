import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { findGit, gitCandidates } from "./find-git.ts";
import { Scratch } from "./fixtures.test-helper.ts";
import { GitRunner } from "./git-runner.ts";

// The PATH-order and relative-folder cases are ported from the desktop's
// git-guard, `limited_run_tests.rs`
// (`git_process_finds_git_only_in_absolute_folders`); its `find_git.rs` has
// no tests of its own. The Windows cases are new.

const scratch = new Scratch();
afterAll(() => scratch.remove());

async function folderWith(name: string, executable: boolean): Promise<string> {
  const folder = await scratch.folder();
  await writeFile(join(folder, name), "");
  await chmod(join(folder, name), executable ? 0o755 : 0o644);
  return folder;
}

verifies("git.find-git", () => {
  describe("findGit", () => {
    it("takes the first absolute folder that has an executable git, in PATH order", async () => {
      const notExecutable = await folderWith("git", false);
      const first = await folderWith("git", true);
      const second = await folderWith("git", true);
      const path = ["", "bin", ".", notExecutable, first, second].join(":");
      expect(await findGit({ path, platform: "linux" })).toBe(join(first, "git"));
    });

    it("skips a folder whose git is a folder", async () => {
      const folder = await scratch.folder();
      await mkdir(join(folder, "git"));
      await expect(findGit({ path: folder, platform: "linux" })).rejects.toThrow("Install git");
    });

    it("never finds git through a relative folder, which would be read against the workspace", async () => {
      await expect(findGit({ path: "bin:.:..", platform: "linux" })).rejects.toThrow("Install git");
    });

    it("on Windows looks only for git.exe, never git.cmd, and only in absolute folders", () => {
      const drive = "C:\\Git\\cmd"; // leak-guard: allow absolute-path an invented Windows folder
      const share = "\\\\server\\share\\bin";
      const path = ["C:git", "\\git", "", drive, share].join(";");
      expect(gitCandidates(path, "win32")).toEqual([`${drive}\\git.exe`, `${share}\\git.exe`]);
    });

    it("reads process.env.PATH when no PATH is given", async () => {
      expect(await findGit()).toMatch(/[\\/]git(?:\.exe)?$/u);
    });
  });

  describe("the runner", () => {
    it("refuses a git path that isn't absolute", async () => {
      await expect(
        GitRunner.create({ git: "git", hooksFolder: await scratch.folder() }),
      ).rejects.toThrow("absolute path");
    });
  });
});
