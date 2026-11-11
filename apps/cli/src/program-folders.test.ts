import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { ProgramCopyUnavailableError } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openProgramFolders, type ProgramFolders } from "./program-folders.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

let folder: string;
let workspace: string;
let copiesFolder: string;
let runner: GitRunner;
let live: Extract<RunVersion, { reads: "live-version" }>;
const opened: ProgramFolders[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-program-folders-"));
  workspace = join(folder, "acme");
  copiesFolder = join(folder, "program-copies");
  await mkdir(workspace);
  runner = await GitRunner.create({ git: await testGit() });
  const vcs = new GitVcs(workspace, {
    runner,
    author: { name: "Test", email: "test@example.com" },
  });
  await vcs.init();
  await writeFile(join(workspace, "server.js"), "live");
  await vcs.stage(["server.js"]);
  const commit = await vcs.commit("First version");
  // Its date doesn't change the folder; a fixed one keeps the test plain.
  live = { reads: "live-version", commit, versionDate: "2026-11-11T09:00:00.000Z" };
  // Saved after the version: neither may reach a live run's programs.
  await writeFile(join(workspace, "server.js"), "saved");
  await writeFile(join(workspace, ".env"), "TOKEN=not-for-programs");
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((programs) => programs.close()));
  await runner.close();
  await rm(folder, { recursive: true, force: true });
});

async function open(): Promise<ProgramFolders> {
  const programs = await openProgramFolders({
    workspaceRoot: workspace,
    copiesFolder,
    git: { git: await testGit() },
  });
  opened.push(programs);
  return programs;
}

verifies("app.runs-read-latest-version", () => {
  it(
    "starts a live run's programs in a copy at its commit, without saved changes or private files",
    async () => {
      const programs = await open();
      const copy = await programs.folderFor(live);
      expect(copy.path.startsWith(copiesFolder)).toBe(true);
      expect(await readFile(join(copy.path, "server.js"), "utf8")).toBe("live");
      expect(await readdir(copy.path)).not.toContain(".env");
    },
    gitTimeout,
  );

  it("starts the programs of a run on the saved files in the workspace folder", async () => {
    const programs = await open();
    const saved = await programs.folderFor({ reads: "saved-files" });
    expect(saved.path).toBe(workspace);
    expect(await readdir(copiesFolder)).toEqual([]);
  });

  it(
    "refuses a version it can't copy, never falling back to the saved folder",
    async () => {
      const programs = await open();
      const unknown = { ...live, commit: "0".repeat(40) };
      await expect(programs.folderFor(unknown)).rejects.toBeInstanceOf(ProgramCopyUnavailableError);
    },
    gitTimeout,
  );

  it(
    "removes the copies when it closes",
    async () => {
      const programs = await open();
      await programs.folderFor(live);
      await programs.close();
      expect(await readdir(copiesFolder)).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "removes the copies a stopped engine left behind when it opens",
    async () => {
      // Made as an engine would, which then lost power before removing it.
      await mkdir(copiesFolder);
      const author = { name: "Test", email: "test@example.com" };
      const stopped = new GitVcs(workspace, { runner, author, worktrees: copiesFolder });
      await stopped.addWorktree(live.commit);
      expect(await readdir(copiesFolder)).toHaveLength(1);

      await open();
      expect(await readdir(copiesFolder)).toEqual([]);
    },
    gitTimeout,
  );
});
