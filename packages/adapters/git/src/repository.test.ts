import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import type { GitRunner } from "./git-runner.ts";
import { type Plant, plantIn } from "./plant.test-helper.ts";
import { Repository } from "./repository.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

async function open(folder: string): Promise<Repository> {
  const repository = await Repository.open(await runner(), folder);
  if (repository === null) throw new Error(`${folder} is a repository.`);
  return repository;
}

async function configIn(repository: Repository, key: string): Promise<string> {
  return (await repository.output({ args: ["config", "--get", key] })).toString().trim();
}

verifies("git.repository", () => {
  describe("which folders are repositories", () => {
    it("takes a folder with its own .git folder, and runs git there", async () => {
      const repository = await open(await repositoryWith(scratch));
      expect((await repository.output({ args: ["ls-files"] })).toString()).toBe("a.yaml\n");
    });

    it("finds none in a folder without .git, or inside another repository", async () => {
      expect(await Repository.open(await runner(), await scratch.folder())).toBeNull();
      const parent = await repositoryWith(scratch, { "acme/a.yaml": "1\n" });
      expect(await Repository.open(await runner(), join(parent, "acme"))).toBeNull();
    });

    it("gives git's own message when a call fails", async () => {
      const repository = await open(await repositoryWith(scratch));
      await expect(
        repository.output({ args: ["rev-parse", "--verify", "missing"] }),
      ).rejects.toThrow("git rev-parse failed: Needed a single revision");
    });
  });

  describe("git files outside the folder", () => {
    it("refuses a .git file that points at a git folder elsewhere", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await scratch.folder();
      await writeFile(join(folder, ".git"), `gitdir: ${join(elsewhere, ".git")}\n`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");
    });

    it("refuses a .git that is a link to another repository's git folder", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await scratch.folder();
      await symlink(join(elsewhere, ".git"), join(folder, ".git"));
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");
    });

    it("refuses alternate objects outside the folder, and accepts them inside", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      const alternates = join(folder, ".git", "objects", "info", "alternates");
      await mkdir(join(folder, ".git", "objects", "info"), { recursive: true });
      await writeFile(alternates, `# planted\n${join(elsewhere, ".git", "objects")}\n`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("outside the folder");

      await mkdir(join(folder, "objects-copy"));
      await writeFile(alternates, `${join(folder, "objects-copy")}\n`);
      await expect(open(folder)).resolves.toBeInstanceOf(Repository);
    });
  });
});

verifies("git.repo-config", () => {
  describe("the repository's own config", () => {
    it("is neutralised on every call: filters, merge drivers and program keys", async () => {
      const folder = await repositoryWith(scratch);
      await plainGit(folder, ["config", "filter.planted.clean", "planted"]);
      await plainGit(folder, ["config", "merge.planted.driver", "planted %A"]);
      await plainGit(folder, ["config", "core.sshCommand", "planted"]);
      const repository = await open(folder);
      expect(await configIn(repository, "filter.planted.clean")).toBe("");
      expect(await configIn(repository, "filter.planted.required")).toBe("false");
      expect(await configIn(repository, "merge.planted.driver")).toBe("exit 1");
      expect(await configIn(repository, "core.sshCommand")).toBe("ssh");
    });

    it("blanks the filters of a repository nested in it as a gitlink", async () => {
      const folder = await repositoryWith(scratch);
      await nestRepository(folder, "vendor");
      await plainGit(join(folder, "vendor"), ["config", "filter.nested.clean", "planted"]);

      expect(await configIn(await open(folder), "filter.nested.clean")).toBe("");
    });

    it("refuses a repository whose config sets merge options", async () => {
      const folder = await repositoryWith(scratch);
      await plainGit(folder, ["config", "branch.main.mergeOptions", "-F planted.txt"]);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow(
        "branch.main.mergeoptions",
      );
    });
  });

  describe("programs the repository's config names never run", () => {
    it("a filter the attributes apply, on add and status", async () => {
      const plantFilter = async (plant: Plant): Promise<void> => {
        await plant.config("filter.planted.clean");
        await plant.config("filter.planted.smudge");
        await plant.attributes("* filter=planted");
      };
      const control = await planted();
      await plantFilter(control.plant);
      await writeFile(join(control.folder, "a.yaml"), "2\n");
      await plainGit(control.folder, ["add", "--all"]);
      expect(await control.plant.ran()).toBe(true);

      const { folder, plant } = await planted();
      await plantFilter(plant);
      await writeFile(join(folder, "a.yaml"), "2\n");
      const repository = await open(folder);
      await repository.output({ args: ["add", "--all"] });
      await repository.output({ args: ["status", "--porcelain"] });
      expect(await plant.ran()).toBe(false);
    });

    it("a diff program, on diff, log -p and show", async () => {
      const plantDiffs = async (plant: Plant, folder: string): Promise<void> => {
        await plant.config("diff.external");
        await plant.config("diff.planted.command");
        await plant.config("diff.planted.textconv");
        await plant.attributes("* diff=planted");
        await writeFile(join(folder, "a.yaml"), "2\n");
      };
      const control = await planted();
      await plantDiffs(control.plant, control.folder);
      await plainGit(control.folder, ["diff"]).catch(() => undefined);
      expect(await control.plant.ran()).toBe(true);

      const { folder, plant } = await planted();
      await plantDiffs(plant, folder);
      const repository = await open(folder);
      await repository.output({
        args: ["commit", "--all", "--quiet", "--message=Acme"],
        config: identity,
      });
      expect((await repository.output({ args: ["diff", "HEAD~1"] })).toString()).toContain("+2");
      await repository.output({ args: ["log", "-p"] });
      await repository.output({ args: ["show", "HEAD"] });
      expect(await plant.ran()).toBe(false);
    });

    it("a filter set after the repository was opened, on the next call", async () => {
      const { folder, plant } = await planted();
      const repository = await open(folder);
      await plant.config("filter.planted.clean");
      await plant.attributes("* filter=planted");
      await writeFile(join(folder, "a.yaml"), "2\n");
      await repository.output({ args: ["add", "--all"] });
      expect(await plant.ran()).toBe(false);
    });

    it("config an include brings in once a checkout has run: includes are refused", async () => {
      const { folder } = await planted();
      const repository = await open(folder);
      await plainGit(folder, ["config", "includeIf.onbranch:planted.path", "../planted-config"]);
      await expect(repository.output({ args: ["status"] })).rejects.toThrow(
        "includeif.onbranch:planted.path",
      );
      await plainGit(folder, ["config", "--unset", "includeIf.onbranch:planted.path"]);
      await plainGit(folder, ["config", "include.path", "../planted-config"]);
      await expect(repository.output({ args: ["status"] })).rejects.toThrow("include.path");
    });
  });
});

const identity = [
  ["user.name", testAuthor.name],
  ["user.email", testAuthor.email],
] as const;

/** Makes `path` in `folder` a repository of its own, with one commit, added to `folder` as a gitlink. */
async function nestRepository(folder: string, path: string): Promise<void> {
  const nested = join(folder, path);
  await writeFiles(nested, { "b.yaml": "1\n" });
  await plainGit(nested, ["init", "--quiet", "--template="]);
  await plainGit(nested, ["add", "--all"]);
  await plainGit(nested, ["commit", "--quiet", "--message=Nested"]);
  await plainGit(folder, ["add", path]);
}

/** What a refused option would run: the interactive diff filter or a filter driver. */
type PlantedFor = "diffFilter" | "filter";

/**
 * Each refused option, with what it would run. `control` marks the ones
 * plain git runs the plant for here, with no one at the prompt; the rest
 * need a person to answer it first.
 */
const refusedOptionCases: readonly {
  args: readonly string[];
  plants: PlantedFor;
  control: boolean;
}[] = [
  { args: ["add", "-p"], plants: "diffFilter", control: true },
  { args: ["add", "--patch"], plants: "diffFilter", control: true },
  { args: ["add", "-vp"], plants: "diffFilter", control: true },
  { args: ["add", "--interactive"], plants: "diffFilter", control: false },
  { args: ["add", "--inter"], plants: "diffFilter", control: false },
  { args: ["add", "-i"], plants: "diffFilter", control: false },
  { args: ["add", "-e"], plants: "diffFilter", control: false },
  { args: ["checkout", "-p"], plants: "diffFilter", control: false },
  { args: ["reset", "--patch"], plants: "diffFilter", control: false },
  { args: ["commit", "-p"], plants: "diffFilter", control: true },
  { args: ["commit", "--interactive"], plants: "diffFilter", control: false },
  { args: ["clean", "-i"], plants: "diffFilter", control: false },
  { args: ["cat-file", "--filters", "HEAD:a.yaml"], plants: "filter", control: true },
];

/** Plants what `plants` names in the repository at `folder`, and changes `a.yaml` so there is a diff to show. */
async function plantFor(plants: PlantedFor, plant: Plant, folder: string): Promise<void> {
  if (plants === "diffFilter") await plant.config("interactive.diffFilter");
  if (plants === "filter") {
    await plant.config("filter.planted.smudge");
    await plant.attributes("* filter=planted");
  }
  await writeFile(join(folder, "a.yaml"), "2\n");
}

/** A new repository with a plant in it, whose program lives outside the repository. */
async function planted(): Promise<{ folder: string; plant: Plant }> {
  const folder = await repositoryWith(scratch);
  return { folder, plant: plantIn(folder, await scratch.folder(), []) };
}

verifies("git.repo-leaks", () => {
  describe("the repository", () => {
    it("runs only the subcommands the adapter uses", async () => {
      const repository = await open(await repositoryWith(scratch));
      for (const args of [["blame", "a.yaml"], ["stash", "show", "-p"], []]) {
        await expect(repository.run({ args }), args.join(" ")).rejects.toThrow(
          "The git adapter doesn't run git",
        );
      }
    });

    describe("refuses an option that starts a program the repository names", () => {
      for (const { args, plants, control } of refusedOptionCases) {
        it(args.join(" "), async () => {
          if (control) {
            const plain = await planted();
            await plantFor(plants, plain.plant, plain.folder);
            // The interactive diff filter only runs on a coloured diff.
            await plainGit(plain.folder, ["-c", "color.ui=always", ...args]).catch(() => undefined);
            expect(await plain.plant.ran()).toBe(true);
          }
          const { folder, plant } = await planted();
          await plantFor(plants, plant, folder);
          await expect((await open(folder)).run({ args })).rejects.toThrow(
            "The git adapter doesn't pass",
          );
          expect(await plant.ran()).toBe(false);
        });
      }
    });

    it("runs the options that share a letter with a refused one elsewhere, and paths after the options", async () => {
      const folder = await repositoryWith(scratch);
      await writeFile(join(folder, "-p"), "1\n");
      const repository = await open(folder);
      await repository.output({ args: ["cat-file", "-p", "HEAD"] });
      await repository.output({ args: ["log", "-p", "--text"] });
      await repository.output({ args: ["add", "--", "-p"] });
      await repository.output({ args: ["add", "--end-of-options", "-p"] });
      await repository.output({
        args: ["commit", "-i", "--quiet", "--message=Acme", "--", "-p"],
        config: identity,
      });
      const committed = await repository.output({ args: ["ls-tree", "--name-only", "HEAD"] });
      expect(committed.toString()).toContain("-p\n");
    });

    it("says which alternate is missing", async () => {
      const folder = await repositoryWith(scratch);
      await mkdir(join(folder, ".git", "objects", "info"), { recursive: true });
      await writeFile(join(folder, ".git", "objects", "info", "alternates"), "missing-objects\n");
      await expect(Repository.open(await runner(), folder)).rejects.toThrow(
        /missing-objects, which doesn't exist/u,
      );
    });

    it("refuses a nested repository whose .git file points outside the workspace", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      await nestRepository(folder, "vendor");
      await rm(join(folder, "vendor", ".git"), { recursive: true });
      await writeFile(join(folder, "vendor", ".git"), `gitdir: ${join(elsewhere, ".git")}\n`);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("nested at");
    });

    it("accepts a nested .git file that points inside the workspace, as a submodule's does", async () => {
      const folder = await repositoryWith(scratch);
      await nestRepository(folder, "vendor");
      await rename(join(folder, "vendor", ".git"), join(folder, ".git", "vendor-git"));
      await writeFile(join(folder, "vendor", ".git"), "gitdir: ../.git/vendor-git\n");
      await expect(open(folder)).resolves.toBeInstanceOf(Repository);
    });

    // git 2.47 runs no config hook; newer git does, whatever core.hooksPath
    // says. Refusing the keys covers both, so this holds on every git.
    it("refuses a repository whose config sets a config hook", async () => {
      const folder = await repositoryWith(scratch);
      await plainGit(folder, ["config", "hook.planted.command", "planted"]);
      await plainGit(folder, ["config", "hook.planted.event", "pre-commit"]);
      await expect(Repository.open(await runner(), folder)).rejects.toThrow("hook.planted");
    });
  });
});
