import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { RunHistory } from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  loadSendWorkspace,
  type OpenWorkspaceHistory,
  openGitHistory,
} from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const workflowFile = "hubs/support/workflows/support-reply.workflow.yaml";
const samsEmail = ["--input", "examples/refund-question.json"];

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let runner: GitRunner;
let vcs: GitVcs;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-live-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: mkdtempSync(join(folder, "profile-")) },
  };
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
});

afterEach(async () => {
  await runner.close();
  await rm(folder, { recursive: true, force: true });
});

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

/** Commits every file in the workspace folder: the workspace's first version. */
async function makeLive(): Promise<void> {
  // Listed before git makes its own folder.
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  await vcs.init();
  await vcs.stage(files);
  await vcs.commit("First version");
}

/** Saves a change to Support reply's name that isn't in a version. */
async function saveNewName(name: string): Promise<void> {
  const path = join(acme, workflowFile);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("name: Support reply", `name: ${name}`));
}

async function run(): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const io = captureIo(acme);
  const command = runCommandWith({ ...testRunSetup(folder, profile), history });
  const code = await runCli(["run", "support-reply", ...samsEmail], io, [command]);
  return { code, stdout: io.stdout, stderr: io.stderr };
}

async function storedRuns(): Promise<number> {
  const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
  return listed.runs.length;
}

verifies("cli.run-live-version", () => {
  it("starts the live version, not a saved change that isn't in a version", async () => {
    await makeLive();
    await saveNewName("Saved reply");

    const { code, stdout } = await run();

    expect(code).toBe(exitCode.ok);
    expect(stdout.join("\n")).toContain("Running Support reply in acme");
    expect(stdout.join("\n")).not.toContain("Saved reply");
  });

  it("starts the saved files when the folder isn't a git repository", async () => {
    await saveNewName("Saved reply");

    const { code, stdout } = await run();

    expect(code).toBe(exitCode.ok);
    expect(stdout.join("\n")).toContain("Running Saved reply in acme");
  });

  it("refuses when the workspace has history but nothing is live yet, and stores no run", async () => {
    await vcs.init();

    const { code, stderr } = await run();

    expect(code).toBe(exitCode.conflict);
    expect(stderr).toEqual([
      "✕ Nothing is live yet, so there is nothing to run. Nothing ran.",
      "  Make the workspace live in the Studio, then run again.",
    ]);
    expect(await storedRuns()).toBe(0);
  });

  describe("runs send", () => {
    const dirOf = () => ({
      root: acme,
      shown: ".",
      name: "acme",
      store: new FolderDefinitionStore(acme, "."),
    });
    const nameOf = async () =>
      filesOf(await loadSendWorkspace(dirOf(), history), "workflow").find(
        (file) => file.value.id === "support-reply",
      )?.value.name;

    it("checks the run on the live version", async () => {
      await makeLive();
      await saveNewName("Saved reply");

      expect(await nameOf()).toBe("Support reply");
    });

    it("checks it on the saved files while nothing is live yet", async () => {
      await vcs.init();
      await saveNewName("Saved reply");

      expect(await nameOf()).toBe("Saved reply");
    });
  });
});
