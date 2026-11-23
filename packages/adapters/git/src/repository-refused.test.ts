import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { plainGit, repositoryWith, Scratch, testRunner } from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { Repository } from "./repository.ts";
import { linkedWorktreeMain } from "./repository-location.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let shared: Promise<GitRunner> | undefined;
function runner(): Promise<GitRunner> {
  shared ??= testRunner(scratch);
  return shared;
}

/** What opening `folder` throws: its kind, message and fix. */
async function refusalOf(
  folder: string,
): Promise<{ kind: unknown; message: string; fix: unknown }> {
  const error = await Repository.open(await runner(), folder).then(
    () => new Error("expected a refusal"),
    (refusal: unknown) => refusal,
  );
  if (!(error instanceof Error)) throw error;
  const { kind, fix } = error as Error & { kind?: unknown; fix?: unknown };
  return { kind, message: error.message, fix };
}

/** The fix when the main folder of a linked worktree isn't known. */
const genericFix =
  "Use the repository's own folder, with its .git folder inside it, not a linked worktree or a submodule, or clone the repository again into a folder of its own. halonic test and halonic validate still work in this folder.";

verifies("git.repository-refused", () => {
  it("refuses git files outside the folder as denied, with the fix", async () => {
    const elsewhere = await repositoryWith(scratch);
    const folder = await scratch.folder();
    await writeFile(join(folder, ".git"), `gitdir: ${join(elsewhere, ".git")}\n`);

    const refusal = await refusalOf(folder);

    expect(refusal.kind).toBe("denied");
    expect(refusal.message).toContain("keeps its git files outside the folder");
    expect(refusal.fix).toBe(genericFix);
  });

  it("names the main folder of a linked worktree in the fix (C715 #2)", async () => {
    const main = await repositoryWith(scratch);
    const worktree = join(await scratch.folder(), "linked");
    await plainGit(main, ["worktree", "add", "--quiet", worktree]);

    const refusal = await refusalOf(worktree);

    expect(refusal.kind).toBe("denied");
    expect(refusal.fix).toBe(
      `Use the repository's own folder, ${await realpath(main)}, or clone the repository again into a folder of its own. halonic test and halonic validate still work in this folder.`,
    );
  });

  // A .git file that is gone by the time it's read stands for any read error:
  // unlike taking away read access, it fails the same way on every platform.
  it("gives no main folder, not a read error, when the worktree's .git file can't be read", async () => {
    const folder = await scratch.folder();

    await expect(linkedWorktreeMain(folder)).resolves.toBeUndefined();
  });

  it("keeps the refusal when the main folder named by .git can't be looked at", async () => {
    const folder = await scratch.folder();
    await writeFile(join(folder, "notes.txt"), "not a folder\n");
    await writeFile(join(folder, ".git"), "gitdir: notes.txt/.git/worktrees/linked\n");

    const refusal = await refusalOf(folder);

    expect(refusal.kind).toBe("denied");
    expect(refusal.fix).toBe(genericFix);
  });

  it("refuses a config key Halonic doesn't allow as denied, with the fix", async () => {
    const folder = await repositoryWith(scratch);
    await plainGit(folder, ["config", "include.path", "elsewhere.gitconfig"]);

    expect(await refusalOf(folder)).toEqual({
      kind: "denied",
      message: "The repository's config sets include.path, which Halonic doesn't allow.",
      fix: "Remove it from .git/config and try again.",
    });
  });

  it("refuses alternates that don't exist as denied, with the fix", async () => {
    const folder = await repositoryWith(scratch);
    await mkdir(join(folder, ".git", "objects", "info"), { recursive: true });
    await writeFile(join(folder, ".git", "objects", "info", "alternates"), "missing-objects\n");

    const refusal = await refusalOf(folder);

    expect(refusal.kind).toBe("denied");
    expect(refusal.fix).toBe("Remove that line from .git/objects/info/alternates and try again.");
  });
});
