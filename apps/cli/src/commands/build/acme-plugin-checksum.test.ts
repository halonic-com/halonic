// Builds the Paperclip plugin of the `acme` example and pins its SHA-256
// (HAL-17966), so an unexpected change to the plugin fails here.
// `acme-plugin.test.ts` checks that two builds of one commit match; this one
// checks that the archive is the one we expect. The build reads the example's
// tool files at a git commit, so the test commits a copy of the example with a
// fixed author and date: the same files always give the same commit, the same
// archive and the same checksum.

import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { plainEnvironment, testGit } from "@halonicjs/adapter-git/testing";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { shippedPluginRuntime } from "../../paperclip-runtime.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { buildCommandWith } from "./command.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

/**
 * The SHA-256 of `halonic-ws.acme-0.1.0.tar`. It changes when the example's
 * tool files, `workspace.yaml`, the plugin's format (its manifest, package
 * file, snapshot or archive) or the runtime's actions, capabilities or
 * settings change. When that change is meant, put the new value here and
 * say why in the pull request.
 */
const expectedSha256 = "1c1f598c0ae411d3a6bcae6e04c7c301030cb139472542755d6240a399196085";

/** The files the plugin is built from: the build reads no other file at the commit. */
const committedFiles = ["workspace.yaml", "library/tools"];

/** A fixed author and date, so the commit id depends on the committed files only. */
const fixedCommit = {
  GIT_AUTHOR_NAME: "Acme",
  GIT_AUTHOR_EMAIL: "build@acme.example",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Acme",
  GIT_COMMITTER_EMAIL: "build@acme.example",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

let folder: string;
let workspace: string;
let git: string;

async function runGit(...args: string[]): Promise<void> {
  await promisify(execFile)(git, args, {
    cwd: workspace,
    env: { ...plainEnvironment(), ...fixedCommit },
  });
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-acme-plugin-"));
  workspace = join(folder, "acme");
  await cp(acmeExample, workspace, { recursive: true });
  git = await testGit();
  await runGit("init", "--quiet", "--initial-branch=main");
  await runGit("add", ...committedFiles);
  await runGit("commit", "--quiet", "--message", "Acme's tools");
  // A worker that never changes, so the checksum follows the plugin's own files only.
  await writeFile(join(folder, "worker.js"), "export {};\n");
}, 20_000);

afterEach(() => removeTestFolder(folder));

async function buildAcme() {
  const io = captureIo(folder);
  const runtime = () => shippedPluginRuntime(pathToFileURL(join(folder, "worker.js")));
  const command = buildCommandWith({ runtime, git: { git } });
  const args = ["build", "paperclip-plugin", "--dir", "acme", "--out", "dist"];
  const code = await runCli([...args, "--plugin-version", "0.1.0", "--json"], io, [command]);
  return { code, io };
}

verifies("cli.commands.build.paperclip-plugin", () => {
  it("builds the acme example's plugin with the SHA-256 it had", async () => {
    const { code, io } = await buildAcme();

    expect(io.stderr).toEqual([]);
    expect(code).toBe(exitCode.ok);
    const release = JSON.parse(
      await readFile(join(folder, "dist", "halonic-ws.acme-0.1.0.release.json"), "utf8"),
    );
    expect(release).toMatchObject({
      pluginId: "halonic-ws.acme",
      version: "0.1.0",
      changes: { added: ["my_prs", "pr_status", "task_get"], removed: [], changed: [] },
    });
    expect(release.sha256).toBe(expectedSha256);
  });
});
