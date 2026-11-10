import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  plainGit,
  repositoryWith,
  Scratch,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
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
      const nested = join(folder, "vendor");
      await writeFiles(nested, { "b.yaml": "1\n" });
      await plainGit(nested, ["init", "--quiet", "--template="]);
      await plainGit(nested, ["add", "--all"]);
      await plainGit(nested, ["commit", "--quiet", "--message=Nested"]);
      await plainGit(nested, ["config", "filter.nested.clean", "planted"]);
      await plainGit(folder, ["add", "vendor"]);

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
});
