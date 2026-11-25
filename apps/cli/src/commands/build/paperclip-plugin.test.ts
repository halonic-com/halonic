import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { PluginRuntime } from "@halonicjs/app";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { shippedPluginRuntime } from "../../paperclip-runtime.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { buildCommandWith } from "./command.ts";

/** A runtime that can run the GitHub pull request action only. */
const runtime: PluginRuntime = {
  worker: encodeUtf8("export {};\n"),
  actions: [
    { name: "github.pull-request", available: true, capabilities: [] },
    { name: "paperclip.task", available: false, capabilities: ["issues.read"] },
  ],
  capabilities: ["agent.tools.register"],
  settings: {},
};

function toolFile(name: string, run = "github.pull-request", description = "Reads one PR.") {
  const settings = run === "paperclip.task" ? "{}" : "{ repositories: [acme/website] }";
  return [
    `name: ${name}`,
    `description: ${description}`,
    "callers: everyone",
    "action:",
    `  run: ${run}`,
    `  with: ${settings}`,
    "",
  ].join("\n");
}

let folder: string;
let vcs: GitVcs;
let git: string;

async function commitAll(): Promise<void> {
  await vcs.stage(["workspace.yaml", "library/tools/pr-status.tool.yaml"]);
  await vcs.commit("A version");
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-build-plugin-"));
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await mkdir(join(folder, "library", "tools"), { recursive: true });
  await writeFile(join(folder, "library", "tools", "pr-status.tool.yaml"), toolFile("pr_status"));
  git = await testGit();
  vcs = new GitVcs(folder, {
    runner: await GitRunner.create({ git }),
    author: { name: "Test", email: "test@example.com" },
  });
  await vcs.init();
  await commitAll();
}, 20_000);

afterEach(() => removeTestFolder(folder));

async function build(...args: string[]) {
  const io = captureIo(folder);
  const command = buildCommandWith({ runtime: async () => runtime, git: { git } });
  const code = await runCli(["build", "paperclip-plugin", ...args], io, [command]);
  return { code, io };
}

async function head(): Promise<string> {
  const [commit] = await vcs.log(1);
  return commit?.hash ?? "";
}

verifies("cli.commands.build.paperclip-plugin", () => {
  it("writes the archive and the release file, and reaches no network", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { code, io } = await build("--out", "dist");

    expect(code).toBe(exitCode.ok);
    expect(fetch).not.toHaveBeenCalled();
    const release = JSON.parse(
      await readFile(join(folder, "dist", "halonic-ws.acme-0.1.0.release.json"), "utf8"),
    );
    expect(release).toMatchObject({
      pluginId: "halonic-ws.acme",
      version: "0.1.0",
      archive: "halonic-ws.acme-0.1.0.tar",
      workspaceCommit: await head(),
      changes: { added: ["pr_status"], removed: [], changed: [] },
    });
    expect(io.stdout).toEqual([
      `✓ Built halonic-ws.acme 0.1.0 from commit ${(await head()).slice(0, 7)}`,
      "  Plugin file    ./dist/halonic-ws.acme-0.1.0.tar",
      "  Release file   ./dist/halonic-ws.acme-0.1.0.release.json",
      `  SHA-256        ${release.sha256}`,
      "  Changes        added pr_status",
    ]);
  });

  it("gives the same bytes when built again, and leaves the files as they are", async () => {
    await build();
    const first = await readFile(join(folder, "halonic-ws.acme-0.1.0.tar"));
    const { code } = await build();

    expect(code).toBe(exitCode.ok);
    expect(await readFile(join(folder, "halonic-ws.acme-0.1.0.tar"))).toEqual(first);
  });

  it("lists what changed since --since and raises the minor version", async () => {
    await build("--plugin-version", "0.3.0");
    await writeFile(
      join(folder, "library", "tools", "pr-status.tool.yaml"),
      toolFile("pr_status", "github.pull-request", "Reads one pull request."),
    );
    await commitAll();
    const { code, io } = await build("--since", "halonic-ws.acme-0.3.0.release.json");

    expect(code).toBe(exitCode.ok);
    expect(io.stdout[0]).toMatch(/^✓ Built halonic-ws\.acme 0\.4\.0 /);
    expect(io.stdout).toContain("  Changes        changed pr_status");
  });

  it("says so when the plugin file isn't next to the --since release file", async () => {
    await build();
    await rm(join(folder, "halonic-ws.acme-0.1.0.tar"));
    const { code, io } = await build("--since", "halonic-ws.acme-0.1.0.release.json");

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't build the plugin: the plugin file halonic-ws.acme-0.1.0.tar isn't next to halonic-ws.acme-0.1.0.release.json.",
    );
  });

  it("refuses a tool file with changes that aren't committed", async () => {
    await writeFile(join(folder, "library", "tools", "pr-status.tool.yaml"), toolFile("pr_check"));
    const { code, io } = await build();

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't build the plugin: library/tools/pr-status.tool.yaml has changes that aren't committed.",
    );
  });

  it("refuses a tool whose action the runtime can't run", async () => {
    await writeFile(
      join(folder, "library", "tools", "task.tool.yaml"),
      toolFile("task_get", "paperclip.task"),
    );
    await vcs.stage(["library/tools/task.tool.yaml"]);
    await vcs.commit("Add a task tool");
    const { code, io } = await build();

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't build the plugin: task_get uses paperclip.task, which a plugin from this version of Halonic can't run yet.",
    );
    expect(io.stderr[1]).toBe(
      "  Take the file for task_get out of library/tools and commit, then build again.",
    );
  });

  it("never overwrites a different archive of the same version", async () => {
    await writeFile(join(folder, "halonic-ws.acme-0.1.0.tar"), "something else");
    const { code, io } = await build();

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't build the plugin: ./halonic-ws.acme-0.1.0.tar is already there, and it isn't this build.",
    );
    expect(await readFile(join(folder, "halonic-ws.acme-0.1.0.tar"), "utf8")).toBe(
      "something else",
    );
  });

  it("refuses a workspace that isn't a git repository", async () => {
    await rm(join(folder, ".git"), { recursive: true, force: true });
    const { code, io } = await build();

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr[0]).toContain("the workspace isn't in a git repository");
    expect(io.stderr[1]).toBe(
      '  Make one and commit: git init && git add . && git commit -m "First version"',
    );
  });

  it("refuses a --plugin-version that isn't x.y.z", async () => {
    const { code, io } = await build("--plugin-version", "v1");

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ --plugin-version takes a version such as 0.3.0, and you gave v1.");
  });

  describe("the shipped runtime", () => {
    it("says so when the worker isn't built", async () => {
      await expect(
        shippedPluginRuntime(new URL(`file://${join(folder, "missing", "worker.js")}`)),
      ).rejects.toThrow("this copy of Halonic has no built plugin runtime.");
    });

    it("takes the worker as it is, and its actions and settings from the runtime", async () => {
      await writeFile(join(folder, "worker.js"), "export {};\n");
      const shipped = await shippedPluginRuntime(new URL(`file://${join(folder, "worker.js")}`));

      expect(shipped.worker).toEqual(encodeUtf8("export {};\n"));
      expect(shipped.actions.map((action) => action.name)).toContain("github.pull-request");
      expect(Object.keys(shipped.settings)).toContain("githubToken");
    });
  });
});
