import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { plainGit, repositoryWith, Scratch, testRunner } from "./fixtures.test-helper.ts";
import { makeRunCheckout, type RunCheckoutOptions, removeRunCheckout } from "./run-checkout.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

const remote = "https://example.com/acme/app.git";

/** A shared repository and the options for a checkout of its only commit in a new folder. */
async function setUp(): Promise<{ options: RunCheckoutOptions; head: string }> {
  const shared = await repositoryWith(scratch, { "a.yaml": "1\n", "docs/b.md": "b\n" });
  const head = (await plainGit(shared, ["rev-parse", "HEAD"])).trim();
  const folder = join(await scratch.folder(), "run");
  return { options: { shared, folder, branch: "acme/task-1", start: head, remote }, head };
}

/** Everything that says what a repository holds: its refs, config, hooks and object list. */
async function snapshot(repository: string): Promise<string[]> {
  const gitDir = join(repository, ".git");
  return [
    await plainGit(repository, ["for-each-ref"]),
    await readFile(join(gitDir, "config"), "utf8"),
    (await readdir(join(gitDir, "hooks")).catch(() => [])).join(","),
    await plainGit(repository, ["count-objects", "-v"]),
    await plainGit(repository, ["status", "--porcelain"]),
  ];
}

verifies("git.run-checkout", () => {
  describe("makeRunCheckout", () => {
    it("checks the commit out on the branch, with the remote set and no hooks", async () => {
      const { options, head } = await setUp();
      await makeRunCheckout(await testRunner(scratch), options);
      expect(await readFile(join(options.folder, "docs", "b.md"), "utf8")).toBe("b\n");
      expect(await plainGit(options.folder, ["branch", "--show-current"])).toBe("acme/task-1\n");
      expect((await plainGit(options.folder, ["rev-parse", "HEAD"])).trim()).toBe(head);
      expect(await plainGit(options.folder, ["remote", "get-url", "origin"])).toBe(`${remote}\n`);
      expect(await readdir(join(options.folder, ".git", "hooks"))).toEqual([]);
    });

    it("borrows the objects instead of copying them", async () => {
      const { options } = await setUp();
      await makeRunCheckout(await testRunner(scratch), options);
      const count = await plainGit(options.folder, ["count-objects", "-v"]);
      expect(count).toMatch(/^count: 0$/mu);
      expect(count).toMatch(/^size: 0$/mu);
      const alternates = await readFile(
        join(options.folder, ".git", "objects", "info", "alternates"),
        "utf8",
      );
      expect(alternates.trim().endsWith(join(".git", "objects"))).toBe(true);
    });

    it("works from a worktree of the shared repository", async () => {
      const { options } = await setUp();
      const worktree = join(await scratch.folder(), "wt");
      await plainGit(options.shared, ["worktree", "add", "--detach", "--quiet", worktree]);
      await makeRunCheckout(await testRunner(scratch), { ...options, shared: worktree });
      expect((await plainGit(options.folder, ["rev-parse", "HEAD"])).trim()).toBe(options.start);
    });

    it("commits in the checkout without touching the shared repository", async () => {
      const { options } = await setUp();
      const before = await snapshot(options.shared);
      await makeRunCheckout(await testRunner(scratch), options);
      await writeFile(join(options.folder, "c.txt"), "c\n");
      await plainGit(options.folder, ["add", "c.txt"]);
      await plainGit(options.folder, ["commit", "--quiet", "--message=Add c"]);
      expect(await plainGit(options.folder, ["log", "--format=%s", "-1"])).toBe("Add c\n");
      expect(await snapshot(options.shared)).toEqual(before);
    });

    it("uses an empty folder that is already there", async () => {
      const { options } = await setUp();
      await mkdir(options.folder);
      await makeRunCheckout(await testRunner(scratch), options);
      expect((await lstat(join(options.folder, ".git"))).isDirectory()).toBe(true);
    });

    it.each([
      ["a relative folder", (o: RunCheckoutOptions) => ({ ...o, folder: "run" }), "absolute"],
      [
        "a branch that is an option",
        (o: RunCheckoutOptions) => ({ ...o, branch: "--x" }),
        "branch",
      ],
      [
        "a start that is a branch",
        (o: RunCheckoutOptions) => ({ ...o, start: "main" }),
        "commit id",
      ],
      ["a local remote", (o: RunCheckoutOptions) => ({ ...o, remote: "/srv/app.git" }), "address"],
      [
        "a start the shared repository lacks",
        (o: RunCheckoutOptions) => ({ ...o, start: "1".repeat(40) }),
        "shared repository",
      ],
    ])("refuses %s and leaves no folder", async (_name, change, message) => {
      const { options } = await setUp();
      await expect(makeRunCheckout(await testRunner(scratch), change(options))).rejects.toThrow(
        message,
      );
      await expect(lstat(options.folder)).rejects.toThrow();
    });

    it("refuses a folder that has files in it, and keeps them", async () => {
      const { options } = await setUp();
      await mkdir(options.folder);
      await writeFile(join(options.folder, "mine.txt"), "mine\n");
      await expect(makeRunCheckout(await testRunner(scratch), options)).rejects.toThrow("empty");
      expect(await readdir(options.folder)).toEqual(["mine.txt"]);
    });

    it("refuses a folder inside the shared repository", async () => {
      const { options } = await setUp();
      const folder = join(options.shared, "run");
      await expect(
        makeRunCheckout(await testRunner(scratch), { ...options, folder }),
      ).rejects.toThrow("can't be inside");
      await expect(lstat(folder)).rejects.toThrow();
    });

    it("an existing empty folder stays, empty, after a refusal", async () => {
      const { options } = await setUp();
      await mkdir(options.folder);
      await expect(
        makeRunCheckout(await testRunner(scratch), { ...options, start: "1".repeat(40) }),
      ).rejects.toThrow("shared repository");
      expect(await readdir(options.folder)).toEqual([]);
    });
  });

  describe("removeRunCheckout", () => {
    it("deletes the folder with everything in it, and the shared repository is as before", async () => {
      const { options } = await setUp();
      const before = await snapshot(options.shared);
      await makeRunCheckout(await testRunner(scratch), options);
      await removeRunCheckout(options.folder);
      await expect(lstat(options.folder)).rejects.toThrow();
      expect(await snapshot(options.shared)).toEqual(before);
    });

    it("does nothing for a folder that isn't there", async () => {
      await expect(
        removeRunCheckout(join(await scratch.folder(), "gone")),
      ).resolves.toBeUndefined();
    });
  });
});
