import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  repositoryWith,
  Scratch,
  testAuthor,
  testRunner,
  writeFiles,
} from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { pathBatches, pathCharactersPerCall } from "./path-batches.ts";
import { GitVcs } from "./vcs.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

/** Windows' limit on a whole command line. */
const windowsLimit = 32_767;

/**
 * 500 paths that come to more than Windows' limit together, each short
 * enough for a Windows temporary folder (260 characters with the folder).
 */
function manyPaths(name: (index: string) => string): string[] {
  const paths = Array.from({ length: 500 }, (_, i) => name(String(i).padStart(3, "0")));
  expect(paths.join(" ").length).toBeGreaterThan(windowsLimit);
  return paths;
}

const longFileNames = (index: string): string =>
  `agents/a-folder-with-a-long-name-for-batches/file-${index}-with-a-long-name.yaml`;

const privateFileNames = (index: string): string =>
  `a-folder-with-a-rather-long-name-that-holds-one-private-file-${index}/.env`;

/** How long the call's arguments make a Windows command line: each quoted, after a space. */
function commandLineLength(args: readonly string[]): number {
  return args.reduce((total, arg) => total + arg.length + 3, 0);
}

/** The runner, and the arguments of every call of `subcommand` it gets from now on. */
async function recordingRunner(
  subcommand: string,
): Promise<{ runner: GitRunner; calls: (readonly string[])[] }> {
  const runner = await testRunner(scratch);
  const calls: (readonly string[])[] = [];
  const run = runner.run.bind(runner);
  vi.spyOn(runner, "run").mockImplementation((call) => {
    // The repository's calls start with `--git-dir=` and `--work-tree=`.
    if (call.args.find((arg) => !arg.startsWith("--")) === subcommand) calls.push(call.args);
    return run(call);
  });
  return { runner, calls };
}

/** Writes each of `paths` under `folder`. */
async function writePaths(folder: string, paths: readonly string[]): Promise<void> {
  await writeFiles(folder, Object.fromEntries(paths.map((path) => [path, "x\n"])));
}

/** A new folder holding `paths`, initialized by the adapter, with no commit yet. */
async function workspaceWith(
  runner: GitRunner,
  paths: readonly string[],
): Promise<{ vcs: GitVcs; folder: string }> {
  const folder = await scratch.folder();
  await writePaths(folder, paths);
  const vcs = new GitVcs(folder, { runner, author: testAuthor });
  await vcs.init();
  return { vcs, folder };
}

function expectSplitUnderTheLimit(calls: readonly (readonly string[])[]): void {
  expect(calls.length).toBeGreaterThan(1);
  for (const args of calls) expect(commandLineLength(args)).toBeLessThan(windowsLimit);
}

verifies("git.path-batches", () => {
  describe("pathBatches", () => {
    it("gives no batch for no paths, and one batch for a short list", () => {
      expect(pathBatches([])).toEqual([]);
      expect(pathBatches(["a.yaml", "b.yaml"])).toEqual([["a.yaml", "b.yaml"]]);
    });

    it("splits a long list in order, each batch within the limit", () => {
      const paths = manyPaths(longFileNames);
      const batches = pathBatches(paths);
      expect(batches.length).toBeGreaterThan(2);
      expect(batches.flat()).toEqual(paths);
      for (const batch of batches) {
        expect(commandLineLength(batch)).toBeLessThanOrEqual(pathCharactersPerCall);
      }
    });

    it("fills a batch up to the limit exactly", () => {
      // Each path takes 3 + 3 characters on the command line.
      expect(pathBatches(["aaa", "bbb", "ccc"], 12)).toEqual([["aaa", "bbb"], ["ccc"]]);
    });

    it("puts a path longer than the limit in a batch of its own", () => {
      const long = "a".repeat(pathCharactersPerCall + 1);
      expect(pathBatches(["a.yaml", long, "b.yaml"])).toEqual([["a.yaml"], [long], ["b.yaml"]]);
    });
  });

  describe("on the git Vcs", () => {
    it("stages a list too long for one call, in several", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("add");
      const { vcs } = await workspaceWith(runner, paths);

      await vcs.stage(paths);

      expectSplitUnderTheLimit(calls);
      const staged = (await vcs.status()).changes.filter((change) => change.staged);
      expect(staged.map((change) => change.path).sort()).toEqual(paths);
    });

    it("unstages such a list before the first commit, in several calls", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("rm");
      const { vcs } = await workspaceWith(runner, paths);
      await vcs.stage(paths);

      await vcs.unstage(paths);

      expectSplitUnderTheLimit(calls);
      expect((await vcs.status()).changes.filter((change) => change.staged)).toEqual([]);
    });

    it("unstages such a list after a commit, in several calls", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("reset");
      const { vcs, folder } = await workspaceWith(runner, ["first.yaml"]);
      await vcs.stage(["first.yaml"]);
      await vcs.commit("First");
      await writePaths(folder, paths);
      await vcs.stage(paths);

      await vcs.unstage(paths);

      expectSplitUnderTheLimit(calls);
      expect((await vcs.status()).changes.filter((change) => change.staged)).toEqual([]);
    });

    it("discards such a list of untracked files, in several calls", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("clean");
      const { vcs, folder } = await workspaceWith(runner, paths);

      await vcs.discard(paths);

      expectSplitUnderTheLimit(calls);
      const left = await readdir(join(folder, "agents"), { recursive: true });
      expect(left).toEqual(["a-folder-with-a-long-name-for-batches"]);
    });

    it("leaves many private files out of a snapshot, in several calls", async () => {
      const paths = manyPaths(privateFileNames);
      const { runner, calls } = await recordingRunner("rm");
      const { vcs } = await workspaceWith(runner, [...paths, "a.yaml"]);

      const snapshot = await vcs.snapshot();

      expectSplitUnderTheLimit(calls);
      expect(await vcs.listAt(snapshot)).toEqual(["a.yaml"]);
    });

    it("makes a first version of a list too long for one call, in several", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("reset");
      const { vcs } = await workspaceWith(runner, paths);

      const version = await vcs.commitVersion({ message: "First version", exclude: [] });

      // The real index takes the new version's content for every path it committed.
      expectSplitUnderTheLimit(calls);
      expect(await vcs.listAt(version)).toEqual(paths);
      expect((await vcs.status()).changes).toEqual([]);
    });

    it("leaves such a list out of a first version, in several calls", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("rm");
      const { vcs } = await workspaceWith(runner, [...paths, "keep.yaml"]);

      const version = await vcs.commitVersion({
        message: "First version",
        include: ["keep.yaml"],
        exclude: [],
      });

      expectSplitUnderTheLimit(calls);
      expect(await vcs.listAt(version)).toEqual(["keep.yaml"]);
    });

    it("leaves such a list out after a commit, in several calls", async () => {
      const paths = manyPaths(longFileNames);
      const { runner, calls } = await recordingRunner("reset");
      const folder = await repositoryWith(scratch, { "keep.yaml": "1\n" });
      const vcs = new GitVcs(folder, { runner, author: testAuthor });
      await writePaths(folder, paths);
      await writeFiles(folder, { "keep.yaml": "2\n" });

      const version = await vcs.commitVersion({
        message: "Second version",
        include: ["keep.yaml"],
        exclude: [],
      });

      // One split for the out-of-scope paths; the real index then takes one path.
      expect(calls.length).toBeGreaterThan(2);
      for (const args of calls) expect(commandLineLength(args)).toBeLessThan(windowsLimit);
      expect(await vcs.listAt(version)).toEqual(["keep.yaml"]);
    });

    it("leaves many private files out of a worktree and its proposal, in several calls", async () => {
      const paths = manyPaths(privateFileNames);
      const { runner, calls } = await recordingRunner("rm");
      const committed = Object.fromEntries(paths.map((path) => [path, "x\n"]));
      const folder = await repositoryWith(scratch, { ...committed, "a.yaml": "1\n" });
      const worktrees = join(await scratch.folder(), "worktrees");
      const vcs = new GitVcs(folder, { runner, author: testAuthor, worktrees });
      const [head] = await vcs.log(1);
      const parent = String(head?.hash);

      const worktree = await vcs.addWorktree(parent);

      expectSplitUnderTheLimit(calls);
      expect((await readdir(worktree.path)).sort()).toEqual([".git", "a.yaml"]);

      calls.length = 0;
      await writePaths(worktree.path, paths);
      const proposal = await vcs.commitWorktreeTo(worktree.id, "refs/halonic/proposals/run-1", {
        parent,
      });

      expectSplitUnderTheLimit(calls);
      expect(await vcs.listAt(proposal)).toEqual(["a.yaml"]);
    });
  });
});
