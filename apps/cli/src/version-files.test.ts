import { existsSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FileAgentPlacementStore, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { AgentPlacement, agentFingerprint } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { SandboxCheck } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { agentFilesOf } from "./local-harness-host.ts";
import { runMessages } from "./messages/run.ts";
import { loadRunWorkspace, type OpenWorkspaceHistory, openGitHistory } from "./run-workspace.ts";
import { SandboxRefusedError } from "./sandbox-gate.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { CommandRunFiles } from "./version-files.ts";
import { checkEngineRuns } from "./workspace-engine.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const writerPath = "hubs/support/agents/writer.agent.yaml";
const supportReply = { hubId: "support", workflowId: "support-reply" };
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;
/** 9 Nov 2026, 10:00 UTC: when the person chose "On this computer". */
const chosen = Date.UTC(2026, 10, 9, 10);

const bubblewrapMissing: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bwrap was not found on PATH"],
};

/** The checks before the engine opens call no server. */
const noServer = {
  fetch: () => Promise.reject(new TypeError("The sandbox check calls no server.")),
};

let folder: string;
let acme: string;
let runner: GitRunner;
let vcs: GitVcs;
let placement: AgentPlacement;
/** How often the sandbox was checked. */
let checks: number;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-version-files-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
  placement = new AgentPlacement({
    store: new FileAgentPlacementStore(join(folder, "placements")),
    digest: webCryptoDigest,
    clock: fixedClock(chosen),
  });
  checks = 0;
  // Writer in Claude Code, which a local-only workspace refuses as an error in its files.
  await appendTo(writerPath, "harness: claude-code\n");
  const settings = join(acme, "workspace.yaml");
  const text = await readFile(settings, "utf8");
  await writeFile(settings, text.replace("localOnly: true", "localOnly: false"));
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

/** The workspace folder as the CLI opens it. */
const dir = () => ({
  root: acme,
  shown: ".",
  name: "acme",
  store: new FolderDefinitionStore(acme, "."),
});

async function appendTo(path: string, lines: string): Promise<void> {
  const file = join(acme, path);
  await writeFile(file, `${await readFile(file, "utf8")}${lines}`);
}

/** Commits every file in the workspace folder, as a new version, by its hash. */
async function commitAll(message: string): Promise<string> {
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && !entry.parentPath.includes(".git"))
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  if (!existsSync(join(acme, ".git"))) await vcs.init();
  await vcs.stage(files);
  return await vcs.commit(message);
}

/** Writer's file as it is on disk now. */
async function writerOnDisk(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(acme, writerPath)));
}

/** A person chose "On this computer" for Writer, for the file `file`. */
async function chooseThisComputer(file: Uint8Array): Promise<void> {
  const subject = { location: await realpath(acme), hub: "support", agent: "writer", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}

/** The run's version as `halonic run` loads it, with its files. */
async function runFiles(): Promise<CommandRunFiles> {
  const loaded = await loadRunWorkspace(dir(), history);
  if (loaded.found !== "loaded") throw new Error("expected a live version");
  return new CommandRunFiles(dir(), { version: loaded.version, loaded }, history);
}

/** The sandbox check before the engine opens, on a computer without bubblewrap. */
async function checkSupportReply(files: CommandRunFiles) {
  const loaded = await loadRunWorkspace(dir(), history);
  if (loaded.found !== "loaded") throw new Error("expected a live version");
  const sandbox = {
    check: async () => {
      checks += 1;
      return bubblewrapMissing;
    },
  };
  return await checkEngineRuns(
    { http: noServer, sandboxGate: () => ({ sandbox, placement }) },
    {
      dir: dir(),
      workspace: loaded.workspace,
      runs: [supportReply],
      ending: runMessages.nothingRan(),
      runFiles: files,
    },
  );
}

verifies("cli.sandbox-gate", () => {
  it("checks On this computer against the agent's file in the version the run starts, not the saved one", {
    timeout: gitTimeout,
  }, async () => {
    await commitAll("Writer in Claude Code");
    await appendTo(writerPath, "# a saved change that isn't live\n");
    await chooseThisComputer(await writerOnDisk());

    await expect(checkSupportReply(await runFiles())).rejects.toBeInstanceOf(SandboxRefusedError);
    expect(checks).toBe(1);
  });

  it("counts a choice made for the agent's file the run's version has, whatever is saved", {
    timeout: gitTimeout,
  }, async () => {
    await commitAll("Writer in Claude Code");
    await chooseThisComputer(await writerOnDisk());
    await appendTo(writerPath, "# a saved change that isn't live\n");

    const placed = await checkSupportReply(await runFiles());

    expect(placed).toEqual([
      { kind: "this-computer", name: "Writer", chosenAt: new Date(chosen).toISOString() },
    ]);
    expect(checks).toBe(0);
  });
});

verifies("cli.local-harness-host", () => {
  it("gives the harness a run's agent file from the version the run recorded, never from disk", {
    timeout: gitTimeout,
  }, async () => {
    const firstCommit = await commitAll("First version");
    const first = await writerOnDisk();
    await appendTo(writerPath, "# second version\n");
    const second = await writerOnDisk();
    await commitAll("Second version");
    await appendTo(writerPath, "# a saved change that isn't live\n");
    const files = await runFiles();
    const atFirst: RunVersion = {
      reads: "live-version",
      commit: firstCommit,
      versionDate: "2026-11-09T10:00:00.000Z",
    };

    // A run `halonic run` starts now reads the live version, the second commit.
    const started = await files.loadedFile(writerPath);
    // A waiting run `halonic runs send` moves on started from the first.
    const waiting = await files.agentFileOf(
      { runId: "01jd8q", version: atFirst },
      "support",
      "writer",
    );

    expect(started).toEqual(second);
    expect(waiting).toEqual(first);
    expect(
      await files.agentFileOf({ runId: "01jd8r", version: null }, "support", "writer"),
    ).toEqual(second);
  });

  it("hashes the agent's file of the run's version for the placement check of run and runs send", {
    timeout: gitTimeout,
  }, async () => {
    const commit = await commitAll("Writer in Claude Code");
    const live = await writerOnDisk();
    await appendTo(writerPath, "# a saved change that isn't live\n");
    const loaded = await loadRunWorkspace(dir(), history);
    if (loaded.found !== "loaded") throw new Error("expected a live version");
    const placementFiles = agentFilesOf({
      location: acme,
      workspace: () => loaded.workspace,
      runFiles: await runFiles(),
    });
    const version: RunVersion = { reads: "live-version", commit, versionDate: "2026-11-09" };

    const file = await placementFiles.bytesOf("support", "writer", { runId: "01jd8q", version });

    expect(file).toEqual(live);
    expect(file).not.toEqual(await writerOnDisk());
  });
});
