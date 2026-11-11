import { chmod, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it, vi } from "vitest";
import { repositoryWith, Scratch, testGit, testRunner } from "./fixtures.test-helper.ts";
import { GitRunner } from "./git-runner.ts";
import { hardenedEnvironment } from "./hardening.ts";

// "The environment" is ported from the desktop's git-guard, `runner_tests.rs`
// (`git_hardening_removes_inherited_git_variables`,
// `git_hardening_sets_a_safe_environment` and
// `git_hardening_gives_its_config_in_the_environment_not_as_arguments`).
// Its cases for submodules, maintenance, bundles and the alternate refs
// command only repeat entries of the config list, so they aren't ported:
// `hardeningConfig` is that same list. "The runner" cases are new: they
// run real git.

const scratch = new Scratch();
afterAll(() => scratch.remove());

/** What git answers in `cwd`, trimmed; the call must succeed. */
async function gitSays(runner: GitRunner, cwd: string, args: string[]): Promise<string> {
  const result = await runner.run({ cwd, args });
  expect(result.code, result.stderr).toBe(0);
  return result.stdout.toString().trim();
}

verifies("git.hardened", () => {
  describe("the environment", () => {
    it("drops every inherited GIT_ variable, whatever its case, and keeps the rest", () => {
      const environment = hardenedEnvironment(
        {
          GIT_DIR: "/elsewhere",
          Git_Work_Tree: "/elsewhere",
          HOME: "/acme/home",
          UNSET: undefined,
        },
        { GIT_CEILING_DIRECTORIES: "/workspaces" },
        [["core.hooksPath", "/hooks"]],
      );
      expect(environment).not.toHaveProperty("GIT_DIR");
      expect(environment).not.toHaveProperty("Git_Work_Tree");
      expect(environment).not.toHaveProperty("UNSET");
      expect(environment).toMatchObject({
        HOME: "/acme/home",
        GIT_CEILING_DIRECTORIES: "/workspaces",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ALLOW_PROTOCOL: "https:ssh",
        GIT_LITERAL_PATHSPECS: "1",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.hooksPath",
        GIT_CONFIG_VALUE_0: "/hooks",
      });
    });
  });

  describe("the runner", () => {
    it("ignores an inherited GIT_DIR and gives git the hardening config", async () => {
      const folder = await repositoryWith(scratch, { "a.yaml": "1\n" });
      const elsewhere = await repositoryWith(scratch, { "b.yaml": "1\n" });
      const runner = await testRunner(scratch, {
        ...process.env,
        GIT_DIR: join(elsewhere, ".git"),
      });
      expect(await gitSays(runner, folder, ["ls-files"])).toBe("a.yaml");
      expect(await gitSays(runner, folder, ["config", "--get", "core.fsmonitor"])).toBe("false");
      expect(await gitSays(runner, folder, ["config", "--get", "credential.helper"])).toBe("");
      expect(await gitSays(runner, folder, ["config", "--get", "core.hooksPath"])).toMatch(
        /halonic-adapter-git-/u,
      );
    });

    it("reads no user config", async () => {
      const home = await scratch.folder();
      await writeFile(join(home, ".gitconfig"), "[alias]\n\tplanted = status\n");
      const folder = await repositoryWith(scratch);
      const runner = await testRunner(scratch, { ...process.env, HOME: home });
      const result = await runner.run({ cwd: folder, args: ["config", "--get", "alias.planted"] });
      expect(result.code).toBe(1);
    });

    it("never looks above the folder for a repository", async () => {
      const parent = await repositoryWith(scratch, { "acme/a.yaml": "1\n" });
      const runner = await testRunner(scratch);
      const result = await runner.run({ cwd: join(parent, "acme"), args: ["status"] });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("not a git repository");
    });

    it("refuses a relative folder, whose ceiling git would ignore", async () => {
      const runner = await testRunner(scratch);
      await expect(runner.run({ cwd: "workspaces/acme", args: ["status"] })).rejects.toThrow(
        "only in an absolute folder",
      );
    });

    it("refuses a relative index file, which git would read in the workspace", async () => {
      const folder = await repositoryWith(scratch);
      const runner = await testRunner(scratch);
      await expect(
        runner.run({ cwd: folder, args: ["status"], indexFile: "other.index" }),
      ).rejects.toThrow("only an absolute index file");
    });

    it("gives git only the absolute folders of the PATH", async () => {
      const folder = await repositoryWith(scratch);
      const path = `bin:.:${process.env["PATH"] ?? ""}`;
      const runner = await testRunner(scratch, { ...process.env, PATH: path });
      const shown = await runner.run({
        cwd: folder,
        args: ["showpath"],
        config: [["alias.showpath", '!printf %s "$PATH"']],
      });
      const folders = shown.stdout.toString().split(":");
      expect(folders.length).toBeGreaterThan(0);
      expect(folders).not.toContain("bin");
      expect(folders).not.toContain(".");
    });

    it("refuses to run while its hooks folder has a file in it", async () => {
      const hooksFolder = await scratch.folder();
      const runner = await GitRunner.create({ git: await testGit(), hooksFolder });
      await writeFile(join(hooksFolder, "pre-commit"), "");
      await expect(runner.run({ cwd: hooksFolder, args: ["--version"] })).rejects.toThrow(
        "has files in it",
      );
      await expect(GitRunner.create({ git: await testGit(), hooksFolder })).rejects.toThrow(
        "has files in it",
      );
    });

    it("reads no ignore or attributes file from the user's config folder", async () => {
      const configHome = await scratch.folder();
      await mkdir(join(configHome, "git"));
      await writeFile(join(configHome, "git", "ignore"), "*.secret\n");
      await writeFile(join(configHome, "git", "attributes"), "*.yaml diff=planted\n");
      const folder = await repositoryWith(scratch);
      await writeFile(join(folder, "b.secret"), "1\n");
      const runner = await testRunner(scratch, {
        ...process.env,
        HOME: configHome,
        XDG_CONFIG_HOME: configHome,
      });
      expect(await gitSays(runner, folder, ["status", "--porcelain"])).toBe("?? b.secret");
      expect(await gitSays(runner, folder, ["check-attr", "diff", "a.yaml"])).toBe(
        "a.yaml: diff: unspecified",
      );
    });
  });
});

verifies("git.runner-close", () => {
  describe("closing the runner", () => {
    it("removes the hooks folder it made, and refuses calls afterwards", async () => {
      const runner = await GitRunner.create({ git: await testGit() });
      const folder = await repositoryWith(scratch);
      const hooksFolder = await gitSays(runner, folder, ["config", "--get", "core.hooksPath"]);
      expect((await stat(hooksFolder)).isDirectory()).toBe(true);
      await runner.close();
      await runner.close();
      await expect(stat(hooksFolder)).rejects.toThrow("ENOENT");
      await expect(runner.run({ cwd: folder, args: ["status"] })).rejects.toThrow("closed");
    });

    it("keeps a hooks folder it was given", async () => {
      const hooksFolder = await scratch.folder();
      const runner = await GitRunner.create({ git: await testGit(), hooksFolder });
      await runner.close();
      expect((await stat(hooksFolder)).isDirectory()).toBe(true);
    });

    // HAL-4428: when `create` refuses the program, nobody gets a runner to close.
    // The refused program is a `/bin/sh` wrapper, as in find-git's HAL-4373
    // test; a wrapper on Windows has to be a compiled git.exe, which this test
    // can't build. The clean-up after a refusal is the same code on Windows.
    it.skipIf(process.platform === "win32")(
      "[platform:win32] HAL-4428: a wrapper there is a compiled git.exe, not a script this test can write: removes the hooks folder it made when it refuses the git program",
      async () => {
        const folder = await scratch.folder();
        const wrapper = join(folder, "git");
        await writeFile(
          wrapper,
          `#!/bin/sh\nunset GIT_CONFIG_COUNT\nexec '${await testGit()}' "$@"\n`,
        );
        await chmod(wrapper, 0o755);
        // The runner makes its hooks folder in the temporary folder, so a
        // folder of its own shows what it leaves behind.
        const temporary = await scratch.folder();
        vi.stubEnv("TMPDIR", temporary);
        try {
          await expect(GitRunner.create({ git: wrapper })).rejects.toThrow(
            "doesn't pass Halonic's git settings on to git",
          );
        } finally {
          vi.unstubAllEnvs();
        }
        expect(await readdir(temporary)).toEqual([]);
      },
    );
  });
});
