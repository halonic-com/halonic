import { appendFile, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { plantedHooks } from "@halonicjs/testing-contracts";
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
import { gitVcsHarness, remoteRunner } from "./harness.test-helper.ts";
import { type Plant, plantIn } from "./plant.test-helper.ts";
import { Repository } from "./repository.ts";
import { GitVcs } from "./vcs.ts";

// Attacks on the hardening from a workspace someone else prepared
// (HAL-3971): each one is refused with a clear error, or provably runs
// nothing.

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

let sharedRemote: Promise<GitRunner> | undefined;
function withRemotes(): Promise<GitRunner> {
  sharedRemote ??= remoteRunner(scratch);
  return sharedRemote;
}

async function open(folder: string): Promise<Repository> {
  const repository = await Repository.open(await runner(), folder);
  if (repository === null) throw new Error(`${folder} is a repository.`);
  return repository;
}

/** Appends `text` to the repository's own config file as it is, in whatever spelling git reads. */
async function appendConfig(folder: string, text: string): Promise<void> {
  await appendFile(join(folder, ".git", "config"), `${text}\n`);
}

/** A repository with a plant in it, whose program lives outside the repository. */
async function planted(): Promise<{ folder: string; plant: Plant }> {
  const folder = await repositoryWith(scratch);
  return { folder, plant: plantIn(folder, await scratch.folder(), plantedHooks) };
}

/** Makes `path` in `folder` a repository of its own, with one commit, added to `folder` as a gitlink. */
async function nestRepository(folder: string, path: string): Promise<string> {
  const nested = join(folder, path);
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, "b.yaml"), "1\n");
  await plainGit(nested, ["init", "--quiet", "--template="]);
  await plainGit(nested, ["add", "--all"]);
  await plainGit(nested, ["commit", "--quiet", "--message=Nested"]);
  await plainGit(folder, ["add", path]);
  return nested;
}

verifies("git.repo-config", () => {
  describe("config that brings in more config, in every spelling git reads", () => {
    const cases: readonly [label: string, text: string, key: string][] = [
      ["include in mixed case", "[InClUdE]\n\tPaTh = ../planted", "include.path"],
      ["includeIf on the git folder", '[includeIf "gitdir:/"]\n\tpath = ../planted', "includeif"],
      [
        "includeIf on a remote's URL",
        '[IncludeIf "hasconfig:remote.*.url:**"]\n\tPATH = ../planted',
        "includeif",
      ],
    ];
    for (const [label, text, key] of cases) {
      it(`refuses ${label}`, async () => {
        const folder = await repositoryWith(scratch);
        await writeFile(join(folder, ".git", "planted"), "[core]\n\tfsmonitor = planted\n");
        await appendConfig(folder, text);
        await expect(Repository.open(await runner(), folder)).rejects.toThrow(key);
      });
    }

    it("refuses an include from the per-worktree config file", async () => {
      const folder = await repositoryWith(scratch);
      await plainGit(folder, ["config", "extensions.worktreeConfig", "true"]);
      await plainGit(folder, ["config", "--worktree", "include.path", "../planted"]);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("include.path");
    });
  });

  describe("programs the repository names, through every method of the port", () => {
    it("never runs a planted hook, fsmonitor, filter, diff or merge program, which plain git does", async () => {
      const plantEverything = async (plant: Plant): Promise<void> => {
        for (const hook of plantedHooks) await plant.hook(hook);
        await plant.config("core.fsmonitor");
        for (const key of ["clean", "smudge", "process"])
          await plant.config(`filter.planted.${key}`);
        await plant.config("filter.planted.required", "true");
        await plant.config("diff.external");
        await plant.config("diff.planted.command");
        await plant.config("diff.planted.textconv");
        await plant.config("merge.planted.driver");
        await plant.attributes("* filter=planted diff=planted merge=planted");
      };
      const control = await planted();
      await plantEverything(control.plant);
      await writeFile(join(control.folder, "a.yaml"), "2\n");
      // The planted programs make plain git fail; only that they ran counts.
      await plainGit(control.folder, ["commit", "--quiet", "--all", "--message=Plain"]).catch(
        () => undefined,
      );
      expect(await control.plant.ran()).toBe(true);

      const { folder, plant } = await planted();
      await plantEverything(plant);
      const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
      await writeFile(join(folder, "a.yaml"), "2\n");
      await writeFile(join(folder, "b.yaml"), "1\n");
      await vcs.status();
      await vcs.diff("a.yaml", false);
      await vcs.stage(["a.yaml", "b.yaml"]);
      await vcs.diff("a.yaml", true);
      const commit = await vcs.commit("Change a");
      await vcs.log(5);
      await vcs.readAt(commit, "a.yaml");
      await vcs.listAt(commit);
      await vcs.snapshot();
      await vcs.createBranch("feature");
      await vcs.rename("b.yaml", "c.yaml");
      await vcs.unstage(["c.yaml"]);
      await writeFile(join(folder, "a.yaml"), "3\n");
      await vcs.discard(["a.yaml"]);
      await vcs.checkout("main");
      expect(await plant.ran()).toBe(false);
    });

    it("neutralises the programs a later option or a commit trailer would bring back", async () => {
      const { folder, plant } = await planted();
      await plant.config("diff.external");
      await plant.config("diff.planted.textconv");
      await plant.attributes("* diff=planted");
      await plant.config("trailer.planted.command");
      await plant.config("trailer.planted.cmd");
      await plant.config("interactive.diffFilter");
      await plant.config("color.ui", "always");
      const repository = await open(folder);
      await writeFile(join(folder, "a.yaml"), "2\n");
      const calls: readonly (readonly string[])[] = [
        ["diff", "--ext-diff"],
        ["diff", "--textconv", "--", "a.yaml"],
        ["log", "-p", "--ext-diff"],
        ["show", "--textconv", "--end-of-options", "HEAD"],
        ["add", "-p"],
        ["commit", "--allow-empty", "--trailer=planted=1", "--message=Trailer"],
      ];
      // Some of them fail on the blanked program; only that none ran counts.
      for (const args of calls) await repository.run({ args });
      expect(await plant.ran()).toBe(false);
    });
  });
});

verifies("git.repo-leaks", () => {
  describe("config that sends git's traffic elsewhere, in every spelling git reads", () => {
    const cases: readonly [label: string, text: string, key: string][] = [
      [
        "insteadOf in a subsection, in upper case",
        '[URL "ssh://planted.invalid/"]\n\tINSTEADOF = ssh://acme.invalid/',
        "url.ssh://planted.invalid/.insteadof",
      ],
      [
        "pushInsteadOf",
        '[url "ssh://planted.invalid/"]\n\tpushInsteadOf = ssh://acme.invalid/',
        "url.ssh://planted.invalid/.pushinsteadof",
      ],
      ["sslVerify in upper case", "[HTTP]\n\tSSLVERIFY = false", "http.sslverify"],
      [
        "sslVerify for one URL",
        '[http "https://acme.example/"]\n\tsslVerify = no',
        "http.https://acme.example/.sslverify",
      ],
      ["the repository's own authority", "[http]\n\tsslCAInfo = planted.pem", "http.sslcainfo"],
      ["an authority folder", "[http]\n\tsslCAPath = planted", "http.sslcapath"],
      [
        "a proxy with the certificate check off",
        "[http]\n\tproxy = http://planted.invalid:3128\n\tsslVerify = false",
        "http.sslverify",
      ],
      [
        "a push URL for a remote, in mixed case",
        '[remote "origin"]\n\tPushURL = ssh://planted.invalid/other.git',
        "remote.origin.pushurl",
      ],
      [
        "a hook in config, in mixed case",
        '[Hook "planted"]\n\tCommand = planted\n\tevent = pre-commit',
        "hook.planted",
      ],
    ];
    for (const [label, text, key] of cases) {
      it(`refuses ${label}`, async () => {
        const folder = await repositoryWith(scratch);
        await appendConfig(folder, text);
        await expect(Repository.open(await runner(), folder)).rejects.toThrow(key);
      });
    }

    it("never lets a remote name a helper such as ext, which would run its URL", async () => {
      const [, theirs] = await gitVcsHarness(scratch, withRemotes, plantedHooks).clones({
        "a.yaml": "1\n",
      });
      await theirs.plant.config("remote.origin.uploadpack");
      const program = await plainGit(theirs.files.location, ["config", "remote.origin.uploadpack"]);
      await plainGit(theirs.files.location, ["config", "--unset", "remote.origin.uploadpack"]);
      await plainGit(theirs.files.location, ["config", "remote.origin.vcs", "ext"]);
      await plainGit(theirs.files.location, ["config", "remote.origin.url", program.trim()]);
      await expect(theirs.vcs.pull()).rejects.toThrow("transport 'ext' not allowed");
      expect(await theirs.plant.ran()).toBe(false);
    });
  });

  describe("subcommands and options outside the allow-list", () => {
    it("refuses a first argument that is an option or an unused subcommand", async () => {
      const repository = await open(await repositoryWith(scratch));
      const refused: readonly (readonly string[])[] = [
        ["-c", "core.fsmonitor=planted", "status"],
        ["--config-env=core.fsmonitor=PATH", "status"],
        ["--upload-pack=planted"],
        ["--exec-path=/tmp", "status"],
        ["--git-dir=/tmp", "status"],
        ["-C", "/", "status"],
        ["-p", "log"],
        ["fetch", "origin"],
        ["clone", "ext::planted"],
        ["submodule", "update"],
        ["difftool", "HEAD"],
        ["mergetool"],
        ["rebase", "--exec=planted", "HEAD"],
        ["am"],
        ["apply", "planted.patch"],
        ["archive", "--remote=ext::planted", "HEAD"],
        ["grep", "--open-files-in-pager=planted", "a"],
        ["credential", "fill"],
        ["hook", "run", "pre-commit"],
        ["bisect", "run", "planted"],
        ["filter-branch"],
        ["maintenance", "run"],
        ["gc"],
        ["Status"],
      ];
      for (const args of refused) {
        await expect(repository.run({ args }), args.join(" ")).rejects.toThrow(
          "The git adapter doesn't run git",
        );
      }
    });

    it("refuses an option that reads or writes a file it names, also abbreviated", async () => {
      const folder = await repositoryWith(scratch);
      const repository = await open(folder);
      const outside = join(await scratch.folder(), "planted");
      const refused: readonly (readonly string[])[] = [
        ["log", `--output=${outside}`],
        ["diff", "--output", outside],
        ["config", `--file=${outside}`, "a.b", "c"],
        ["config", `--fil=${outside}`, "a.b", "c"],
        ["config", "-f", outside, "a.b", "c"],
        ["commit", "--allow-empty", `-F${outside}`],
        ["commit", "--allow-empty", "-aF", outside],
        ["commit", "--allow-empty", `--templ=${outside}`],
        ["add", `--pathspec-from-file=${outside}`],
        ["cat-file", "--textconv", "HEAD:a.yaml"],
      ];
      for (const args of refused) {
        await expect(repository.run({ args }), args.join(" ")).rejects.toThrow(
          "The git adapter doesn't pass",
        );
      }
      // After `--` it is a path, not an option.
      await expect(
        repository.run({ args: ["ls-files", "--", "--output=x"] }),
      ).resolves.toBeDefined();
      expect(await readdir(dirname(outside))).toEqual([]);
    });

    it("passes a path that looks like an option only as a path", async () => {
      const folder = await repositoryWith(scratch);
      const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
      // Read as an option, `--output=planted-out` would write that file.
      for (const option of ["--output=planted-out", "--upload-pack=planted", "-c"]) {
        await writeFile(join(folder, option), "1\n");
        await vcs.stage([option]);
        expect(await vcs.diff(option, true)).toContain("+1");
        await vcs.unstage([option]);
        await vcs.discard([option]);
      }
      expect(await readdir(folder)).toEqual([".git", "a.yaml"]);
    });

    it("refuses a branch name or a version that looks like an option", async () => {
      const vcs = new GitVcs(await repositoryWith(scratch), {
        runner: await runner(),
        author: testAuthor,
      });
      for (const name of ["-c", "--upload-pack=planted", "--orphan"]) {
        await expect(vcs.createBranch(name), name).rejects.toThrow(RangeError);
        await expect(vcs.checkout(name), name).rejects.toThrow(RangeError);
      }
      await expect(vcs.readAt("--output=planted", "a.yaml")).rejects.toThrow(RangeError);
      await expect(vcs.listAt("--textconv")).rejects.toThrow(RangeError);
    });

    it("takes a message that looks like an option only as the message", async () => {
      const folder = await repositoryWith(scratch);
      const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
      await writeFile(join(folder, "a.yaml"), "2\n");
      await vcs.stage(["a.yaml"]);
      await vcs.commit("--amend --trailer=planted --file=/etc/hostname");
      const [last] = await vcs.log(1);
      expect(last?.message).toBe("--amend --trailer=planted --file=/etc/hostname");
      expect(await vcs.log(5)).toHaveLength(2);
    });
  });
});

verifies("git.repository", () => {
  describe("git files outside the workspace", () => {
    it("refuses a commondir file that points at another repository", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      await writeFile(join(folder, ".git", "commondir"), `${join(elsewhere, ".git")}\n`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");
    });

    it("refuses a core.worktree elsewhere", async () => {
      const folder = await repositoryWith(scratch);
      await appendConfig(folder, `[Core]\n\tWorkTree = ${await scratch.folder()}`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");
    });

    it("refuses alternates outside, relative, quoted or through a link inside the folder", async () => {
      const elsewhere = join(await repositoryWith(scratch), ".git", "objects");
      const alternatesIn = async (line: (folder: string) => Promise<string>): Promise<string> => {
        const folder = await repositoryWith(scratch);
        await mkdir(join(folder, ".git", "objects", "info"), { recursive: true });
        const alternates = join(folder, ".git", "objects", "info", "alternates");
        await writeFile(alternates, `${await line(folder)}\n`);
        return folder;
      };
      const relativeLine = await alternatesIn(async (folder) =>
        relative(join(folder, ".git", "objects"), elsewhere),
      );
      const quotedLine = await alternatesIn(async () => JSON.stringify(elsewhere));
      const linkedLine = await alternatesIn(async (folder) => {
        await symlink(elsewhere, join(folder, "objects-link"));
        return join(folder, "objects-link");
      });
      for (const folder of [relativeLine, linkedLine]) {
        await expect(Repository.open(await runner(), folder)).rejects.toThrow(
          "reads objects from outside the folder",
        );
      }
      // git unquotes the line; the adapter takes it as a missing folder and refuses it too.
      await expect(Repository.open(await runner(), quotedLine)).rejects.toThrow("doesn't exist");
    });

    it("follows alternates as deep as git does: five levels below the repository's own", async () => {
      const elsewhere = join(await repositoryWith(scratch), ".git", "objects");
      const folder = await repositoryWith(scratch);
      let objects = join(folder, ".git", "objects");
      for (let level = 1; level <= 5; level++) {
        const next = join(folder, `objects-${level}`);
        await mkdir(join(objects, "info"), { recursive: true });
        await writeFile(join(objects, "info", "alternates"), `${next}\n`);
        await mkdir(next);
        objects = next;
      }
      await expect(open(folder)).resolves.toBeInstanceOf(Repository);
      await mkdir(join(objects, "info"), { recursive: true });
      await writeFile(join(objects, "info", "alternates"), `${elsewhere}\n`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow(
        "reads objects from outside the folder",
      );
    });

    it("refuses a nested repository whose git folder names a common folder outside", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      const nested = await nestRepository(folder, "vendor");
      await writeFile(join(nested, ".git", "commondir"), `${join(elsewhere, ".git")}\n`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("nested at");
    });

    it("refuses an untracked nested repository whose .git file names a git folder outside", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      await mkdir(join(folder, "deep", "vendor"), { recursive: true });
      await writeFile(
        join(folder, "deep", "vendor", ".git"),
        `gitdir: ${join(elsewhere, ".git")}\n`,
      );
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("nested at");
    });

    it("refuses add --force, which would record an ignored nested repository", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      await mkdir(join(folder, "vendor"));
      await writeFile(join(folder, "vendor", ".git"), `gitdir: ${join(elsewhere, ".git")}\n`);
      await writeFile(join(folder, ".gitignore"), "vendor/\n");
      const repository = await open(folder);
      for (const args of [
        ["add", "-f", "--", "vendor"],
        ["add", "-Af", "--", "vendor"],
        ["add", "--force", "--", "vendor"],
        ["add", "--forc", "--", "vendor"],
      ]) {
        await expect(repository.run({ args }), args.join(" ")).rejects.toThrow(
          "The git adapter doesn't pass",
        );
      }
    });

    it("allows an untracked nested repository with its git folder inside", async () => {
      const folder = await repositoryWith(scratch);
      await nestRepository(folder, "vendor");
      await plainGit(folder, ["reset", "--quiet", "--", "vendor"]);
      const vcs = new GitVcs(folder, { runner: await runner(), author: testAuthor });
      await expect(vcs.snapshot()).resolves.toMatch(/^[0-9a-f]{40}$/u);
    });

    it("refuses a nested repository behind a .git link to a folder outside", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      const nested = await nestRepository(folder, "vendor");
      await rm(join(nested, ".git"), { recursive: true });
      await symlink(join(elsewhere, ".git"), join(nested, ".git"));
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("nested at");
    });
  });
});
