import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { RunHistory } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  loadRunWorkspace,
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
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

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

/** Opens no history: git can't start, as when it isn't installed. */
const noGit: OpenWorkspaceHistory = () =>
  Promise.reject(new Error("git wasn't found on the PATH."));

/** Commits every file in the workspace folder: the workspace's first version, by its hash. */
async function makeLive(): Promise<string> {
  // Listed before git makes its own folder.
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  await vcs.init();
  await vcs.stage(files);
  return await vcs.commit("First version");
}

/** Saves a change to Support reply's name that isn't in a version. */
async function saveNewName(name: string): Promise<void> {
  const path = join(acme, workflowFile);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("name: Support reply", `name: ${name}`));
}

async function run(
  opener: OpenWorkspaceHistory = history,
): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const io = captureIo(acme);
  const command = runCommandWith({ ...testRunSetup(folder, profile), history: opener });
  const code = await runCli(["run", "support-reply", ...samsEmail], io, [command]);
  return { code, stdout: io.stdout, stderr: io.stderr };
}

async function storedRuns(): Promise<number> {
  const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
  return listed.runs.length;
}

/** The `run.started` of the one stored run. */
async function runStarted(): Promise<RunEvent | undefined> {
  const runs = await openWorkspaceRuns(acme, profile);
  const [stored] = (await new RunHistory(runs).listRuns()).runs;
  const events = await runs.events(stored?.id ?? "");
  return events.find((event) => event.type === "run.started");
}

/** The workspace folder as the CLI opens it. */
const dirOf = () => ({
  root: acme,
  shown: ".",
  name: "acme",
  store: new FolderDefinitionStore(acme, "."),
});

verifies("cli.run-live-version", () => {
  it(
    "starts the live version, not a saved change that isn't in a version",
    async () => {
      await makeLive();
      await saveNewName("Saved reply");

      const { code, stdout } = await run();

      expect(code).toBe(exitCode.ok);
      expect(stdout.join("\n")).toContain("Running Support reply in acme");
      expect(stdout.join("\n")).not.toContain("Saved reply");
      expect(await storedRuns()).toBe(1);
    },
    gitTimeout,
  );

  it(
    "says uncommitted changes to a definition file aren't used, before the heading",
    async () => {
      await makeLive();
      await saveNewName("Saved reply");

      const { stdout } = await run();

      expect(stdout.slice(0, 2)).toEqual([
        "Your uncommitted changes aren't used. Commit them to run them.",
        expect.stringContaining("Running Support reply in acme"),
      ]);
    },
    gitTimeout,
  );

  it(
    "records on the run the live version's commit and date",
    async () => {
      const commit = await makeLive();
      const [head] = await vcs.log(1);

      expect(await run()).toMatchObject({ code: exitCode.ok });

      expect(await runStarted()).toMatchObject({
        version: { reads: "live-version", commit, versionDate: head?.date },
      });
    },
    gitTimeout,
  );

  it(
    "says nothing about changes when nothing changed, or only a file no kind places",
    async () => {
      await makeLive();
      const untouched = await run();
      await writeFile(join(acme, "examples/refund-question.json"), '{"mail": "Changed"}');
      await writeFile(join(acme, "notes.txt"), "Not committed.");
      const inputOnly = await run();

      for (const { stdout } of [untouched, inputOnly]) {
        expect(stdout.join("\n")).not.toContain("uncommitted");
      }
    },
    gitTimeout,
  );

  it(
    "records on the run that it read the saved files when the folder isn't a git repository",
    async () => {
      expect(await run()).toMatchObject({ code: exitCode.ok });

      expect(await runStarted()).toMatchObject({ version: { reads: "saved-files" } });
    },
    gitTimeout,
  );

  it(
    "loads the live version with its commit as the workspace's version",
    async () => {
      const commit = await makeLive();
      await saveNewName("Saved reply");

      // The run keeps the definitions it loaded; their version is this commit.
      expect(await loadRunWorkspace(dirOf(), history)).toMatchObject({
        found: "loaded",
        workspace: { version: commit },
        changesNotLive: true,
        version: { reads: "live-version", commit },
      });
    },
    gitTimeout,
  );

  it(
    "starts the saved files when the folder isn't a git repository",
    async () => {
      await saveNewName("Saved reply");

      const { code, stdout } = await run();

      expect(code).toBe(exitCode.ok);
      expect(stdout.join("\n")).toContain("Running Saved reply in acme");
    },
    gitTimeout,
  );

  it(
    "refuses when the workspace has history but nothing is live yet, and stores no run",
    async () => {
      await vcs.init();

      const { code, stderr } = await run();

      expect(code).toBe(exitCode.conflict);
      expect(stderr).toEqual([
        "✕ Nothing is live yet, so there is nothing to run. Nothing ran.",
        "  Make a first commit in git, then run again.",
      ]);
      expect(await storedRuns()).toBe(0);
    },
    gitTimeout,
  );

  it(
    "refuses when the workspace has history but git can't start, and stores no run",
    async () => {
      await makeLive();

      const { code, stderr } = await run(noGit);

      expect(code).toBe(exitCode.unavailable);
      expect(stderr).toEqual([
        "✕ Couldn't run support-reply: git can't start on this computer, so the live version can't be read. Nothing ran.",
        "  Install git and make sure it's on your PATH, then try again.",
      ]);
      expect(await storedRuns()).toBe(0);
    },
    gitTimeout,
  );

  describe("runs send", () => {
    const nameOf = async () =>
      filesOf(await loadSendWorkspace(dirOf(), history), "workflow").find(
        (file) => file.value.id === "support-reply",
      )?.value.name;

    it(
      "checks the run on the live version",
      async () => {
        await makeLive();
        await saveNewName("Saved reply");

        expect(await nameOf()).toBe("Support reply");
      },
      gitTimeout,
    );

    it(
      "checks it on the saved files while nothing is live yet",
      async () => {
        await vcs.init();
        await saveNewName("Saved reply");

        expect(await nameOf()).toBe("Saved reply");
      },
      gitTimeout,
    );

    it(
      "refuses when git can't start, rather than check the saved files",
      async () => {
        await makeLive();

        await expect(loadSendWorkspace(dirOf(), noGit)).rejects.toMatchObject({
          kind: "unavailable",
          message:
            "git can't start on this computer, so the live version can't be read. Nothing was sent.",
          fix: "Install git and make sure it's on your PATH, then try again.",
          cause: new Error("git wasn't found on the PATH."),
        });
      },
      gitTimeout,
    );
  });
});
