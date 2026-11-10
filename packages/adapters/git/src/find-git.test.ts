import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { programCandidates } from "@halonicjs/adapter-system-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { findGit } from "./find-git.ts";
import { Scratch, testGit } from "./fixtures.test-helper.ts";
import { GitRunner } from "./git-runner.ts";

// The PATH-order and relative-folder cases are ported from the desktop's
// git-guard, `limited_run_tests.rs`
// (`git_process_finds_git_only_in_absolute_folders`); its `find_git.rs` has
// no tests of its own. The Windows cases are new. findGit is findProgram
// for git: the shared lookup's own tests are in adapter-system-node
// (`find-program.test.ts`), and these keep covering it through git.

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
      expect(programCandidates("git", path, "win32")).toEqual([
        `${drive}\\git.exe`,
        `${share}\\git.exe`,
      ]);
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

    // Windows names the variable `Path`; the runner reads it in any case.
    it.runIf(process.platform !== "win32")(
      "looks for git in the Path of the environment it is given, in any case",
      async () => {
        const folder = await scratch.folder();
        // It answers the runner's check that the hardening reaches git, as git would.
        await writeFile(
          join(folder, "git"),
          '#!/bin/sh\nif [ "$2" = config ]; then printf "%s\\n" "$GIT_CONFIG_VALUE_0"; else echo acme-git; fi\n',
        );
        await chmod(join(folder, "git"), 0o755);
        const runner = await GitRunner.create({
          environment: { Path: folder },
          hooksFolder: await scratch.folder(),
        });
        const result = await runner.run({ cwd: folder, args: ["--version"] });
        expect(result.stdout.toString().trim()).toBe("acme-git");
      },
    );

    // HAL-4373: an agent runner's launcher on the PATH did this, and every
    // planted hook and program ran.
    it.runIf(process.platform !== "win32")(
      "refuses a git wrapper that drops the hardening config",
      async () => {
        const folder = await scratch.folder();
        const wrapper = join(folder, "git");
        await writeFile(
          wrapper,
          `#!/bin/sh\nunset GIT_CONFIG_COUNT\nexec '${await testGit()}' "$@"\n`,
        );
        await chmod(wrapper, 0o755);
        await expect(
          GitRunner.create({ git: wrapper, hooksFolder: await scratch.folder() }),
        ).rejects.toThrow("doesn't pass Halonic's git settings on to git");
      },
    );
  });
});
