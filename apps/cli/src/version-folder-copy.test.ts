import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { plainEnvironment, testGit } from "@halonicjs/adapter-git/testing";
import { verifies } from "@halonicjs/testing-spec";
import { VersionFolder } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeTestFolder } from "./test/remove-folder.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

/** An integration committed with a private file in it, and a private file at the top. */
const committed: Readonly<Record<string, string>> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  ".env": "ACME_MODE=demo\n",
  "integrations/notes/integration.yaml": "id: notes\n",
  "integrations/notes/backend/index.js": "export default 1;\n",
  "integrations/notes/.env": "NOTES_MODE=demo\n",
  "integrations/notes/.envrc": "export NOTES_MODE=demo\n",
};

let folder: string;
let workspace: string;
let runner: GitRunner;
let vcs: GitVcs;
let commit: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-version-folder-"));
  workspace = join(folder, "acme");
  for (const [path, text] of Object.entries(committed)) {
    await mkdir(dirname(join(workspace, path)), { recursive: true });
    await writeFile(join(workspace, path), text);
  }
  // Plain git, not `GitVcs`, which never stages a private file: the commit must hold them.
  const git = await testGit();
  for (const args of [
    ["init", "--quiet", "--template="],
    ["add", "--all", "--force"],
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "v1"],
  ]) {
    const done = spawnSync(git, args, { cwd: workspace, env: plainEnvironment() });
    if (done.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${done.stderr}`);
  }
  runner = await GitRunner.create({ git });
  vcs = new GitVcs(workspace, {
    runner,
    author: { name: "Test", email: "test@example.com" },
    worktrees: join(folder, "copies"),
  });
  const [head] = await vcs.log(1);
  if (head === undefined) throw new Error("The test's commit wasn't made.");
  commit = head.hash;
});

afterEach(async () => {
  for (const copy of await vcs.listWorktrees()) await vcs.removeWorktree(copy.id);
  await runner.close();
  await removeTestFolder(folder);
});

verifies("workspace.version-folder", () => {
  it(
    "holds the files a run's copy of the commit holds, private entries left out by the same rule",
    async () => {
      const copy = await vcs.addWorktree(commit);
      // Less the copy's `.git` file, its link to the repository, which git writes and no commit holds.
      const onDisk = (await new FileSystemFolderReader(copy.path, "copy").entries()).filter(
        (entry) => entry.path !== ".git",
      );
      const atCommit = await new VersionFolder(vcs, commit, workspace).entries();

      expect(atCommit).toEqual(onDisk);
      expect(atCommit.map((entry) => entry.path)).toEqual([
        "integrations",
        "integrations/notes",
        "integrations/notes/backend",
        "integrations/notes/backend/index.js",
        "integrations/notes/integration.yaml",
        "workspace.yaml",
      ]);
    },
    gitTimeout,
  );
});
