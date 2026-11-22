import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { repositoryWith, Scratch, testRunner } from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { Repository } from "./repository.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

const refused = "sets include.path";

async function forCall(folder: string, checkAtOpen = false): Promise<Repository> {
  return Repository.forCall(await runner(), folder, {
    checkAtOpen,
    notARepository: () => new Error("Not a repository: initialize it first."),
  });
}

/** Plants config that every full check refuses. */
async function plantRefusedConfig(folder: string): Promise<void> {
  await appendFile(join(folder, ".git", "config"), "[include]\n\tpath = planted\n");
}

const head = { args: ["rev-parse", "--verify", "--quiet", "HEAD"] };

verifies("git.repository", () => {
  describe("the checks of one port call", () => {
    it("checks at the first git command, and says when the folder is no repository", async () => {
      const folder = await scratch.folder();
      const repository = await forCall(folder);
      await expect(repository.run(head)).rejects.toThrow("Not a repository");
      await expect(forCall(folder, true)).rejects.toThrow("Not a repository");
    });

    it("checks on opening when asked, and drops that check", async () => {
      const folder = await repositoryWith(scratch);
      const repository = await forCall(folder, true);
      await plantRefusedConfig(folder);
      await expect(repository.run(head)).rejects.toThrow(refused);
    });

    it("holds a check for a command that keeps it, and never for the next port call", async () => {
      const folder = await repositoryWith(scratch);
      const repository = await forCall(folder);
      expect((await repository.run(head)).code).toBe(0);
      await plantRefusedConfig(folder);
      expect((await repository.run(head)).code).toBe(0);
      await expect((await forCall(folder)).run(head)).rejects.toThrow(refused);
    });

    it("checks again after a command that doesn't keep the check", async () => {
      const folder = await repositoryWith(scratch);
      const repository = await forCall(folder);
      await repository.output({ args: ["add", "--all", "--", "."] });
      await plantRefusedConfig(folder);
      await expect(repository.run(head)).rejects.toThrow(refused);
    });

    it("checks again after the adapter writes a file itself", async () => {
      const folder = await repositoryWith(scratch);
      const repository = await forCall(folder);
      expect((await repository.run(head)).code).toBe(0);
      await plantRefusedConfig(folder);
      repository.changed();
      await expect(repository.run(head)).rejects.toThrow(refused);
    });

    it("lists the nested repositories for a command that looks at the files, after one that didn't", async () => {
      const elsewhere = await repositoryWith(scratch);
      const folder = await repositoryWith(scratch);
      const repository = await forCall(folder);
      expect((await repository.run(head)).code).toBe(0);
      await mkdir(join(folder, "vendor"));
      await writeFile(join(folder, "vendor", ".git"), `gitdir: ${join(elsewhere, ".git")}\n`);
      await expect(repository.run({ args: ["status", "--porcelain"] })).rejects.toThrow(
        "nested at",
      );
    });
  });

  describe("a read that doesn't look at the files", () => {
    it("refuses status and a diff of the files, and takes a diff of the index", async () => {
      const folder = await repositoryWith(scratch);
      const reader = await Repository.openReader(await runner(), folder, false);
      if (reader === null) throw new Error(`${folder} is a repository.`);
      await expect(reader.run({ args: ["status", "--porcelain"] })).rejects.toThrow(
        "doesn't look at the files",
      );
      await expect(reader.run({ args: ["diff", "--", "a.yaml"] })).rejects.toThrow(
        "doesn't look at the files",
      );
      const staged = await reader.output({ args: ["diff", "--cached", "--", "a.yaml"] });
      expect(staged.toString()).toBe("");
    });
  });
});
