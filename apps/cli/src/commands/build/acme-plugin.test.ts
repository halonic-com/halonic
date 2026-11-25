// Builds the Paperclip plugin of the public example workspace
// (`examples/acme`) the way a user would, then builds the same commit again
// from a second copy in another folder and checks that both builds have the
// same bytes and the same sha-256 (plan HAL-17450 rev 5, step 1a-4).

import { cp, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { PluginRuntime } from "@halonicjs/app";
import { encodeUtf8 } from "@halonicjs/std";
import { pluginActions, runtimeCapabilities } from "@halonicjs/target-paperclip-runtime/actions";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { buildCommandWith } from "./command.ts";

/** The repository's example workspace. */
const acmeFolder = join(import.meta.dirname, "..", "..", "..", "..", "..", "examples", "acme");

/**
 * The shipped runtime's actions and capabilities, with a fixed worker: the
 * real worker is only there after the runtime package's build, and a fixed
 * one keeps this test about the builder, not about that build.
 */
const runtime: PluginRuntime = {
  worker: encodeUtf8("export {};\n"),
  actions: pluginActions(),
  capabilities: runtimeCapabilities,
  settings: {},
};

/** The archive and release file names of the first build. */
const archiveName = "halonic-ws.acme-0.1.0.tar";
const releaseName = "halonic-ws.acme-0.1.0.release.json";

let root: string;
let git: string;

/** The example's files, as paths relative to its folder with `/` between parts. */
async function exampleFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(folder.length + 1)
        .split(sep)
        .join("/"),
    )
    .sort();
}

/** Copies the example into `folder` and commits all of it as one commit. */
async function commitExample(folder: string): Promise<GitVcs> {
  await cp(acmeFolder, folder, { recursive: true });
  // Listed before `init`, so the repository's own `.git` files aren't in the list.
  const files = await exampleFiles(folder);
  const vcs = new GitVcs(folder, {
    runner: await GitRunner.create({ git }),
    author: { name: "Test", email: "test@example.com" },
  });
  await vcs.init();
  await vcs.stage(files);
  await vcs.commit("The acme example");
  return vcs;
}

async function build(folder: string, out: string) {
  const io = captureIo(folder);
  const command = buildCommandWith({ runtime: async () => runtime, git: { git } });
  const code = await runCli(["build", "paperclip-plugin", "--out", out], io, [command]);
  return { code, io };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-acme-plugin-"));
  git = await testGit();
}, 20_000);

afterEach(() => removeTestFolder(root));

verifies("cli.commands.build.paperclip-plugin", () => {
  it("builds the acme example's plugin with its three tools", async () => {
    const folder = join(root, "acme");
    await commitExample(folder);
    const { code, io } = await build(folder, "dist");

    expect(code, io.stderr.join("\n")).toBe(exitCode.ok);
    const release = JSON.parse(await readFile(join(folder, "dist", releaseName), "utf8"));
    expect(release).toMatchObject({
      pluginId: "halonic-ws.acme",
      version: "0.1.0",
      archive: archiveName,
      changes: { added: ["my_prs", "pr_status", "task_get"], removed: [], changed: [] },
    });
  });

  it("gives the same bytes and sha-256 when the same commit is built again elsewhere", async () => {
    const first = join(root, "first");
    const vcs = await commitExample(first);
    // A second checkout of the same commit, in another folder.
    const second = join(root, "second");
    await cp(first, second, { recursive: true });
    const [commit] = await vcs.log(1);

    expect((await build(first, "dist")).code).toBe(exitCode.ok);
    expect((await build(second, "dist")).code).toBe(exitCode.ok);
    const releaseOf = async (folder: string) =>
      JSON.parse(await readFile(join(folder, "dist", releaseName), "utf8"));
    const [firstRelease, secondRelease] = [await releaseOf(first), await releaseOf(second)];

    expect(firstRelease.workspaceCommit).toBe(commit?.hash);
    expect(secondRelease).toEqual(firstRelease);
    expect(await readFile(join(second, "dist", archiveName))).toEqual(
      await readFile(join(first, "dist", archiveName)),
    );
  });
});
