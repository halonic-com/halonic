import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { DefinitionStore } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { openGitHistory } from "../../run-workspace.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { WatchedVersions } from "./watch-versions.ts";

// The version a run's connectors start from in `routines watch` (HAL-7500):
// the one the run read, checked for trust, with the grant of that check.

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let versions: WatchedVersions | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-watch-versions-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await versions?.close();
  versions = undefined;
  await removeTestFolder(folder);
});

/** The watch's versions of Acme with history off: the saved files. */
async function watchAcme(): Promise<WatchedVersions> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  versions = await WatchedVersions.open(dir, async () => null);
  return versions;
}

/** Commits every file in the workspace as a new version and gives its commit. */
async function commitAll(vcs: GitVcs, store: DefinitionStore): Promise<string> {
  await vcs.stage(await store.list());
  return await vcs.commit("A version");
}

/** A run that read the saved files. */
const savedRun = { runId: "run-1", version: { reads: "saved-files" } } as const;

/** The ids of the workspace's provider files. */
function providersOf(workspace: LoadedWorkspace): string[] {
  return filesOf(workspace, "provider").map((file) => file.value.id);
}

verifies("cli.local-engine", () => {
  it("gives a run's version with the grant of its own trust check, not the one read last", async () => {
    const watched = await watchAcme();
    const checked: string[][] = [];
    watched.checkWith({
      trust: async (workspace) => {
        checked.push(providersOf(workspace));
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await writeFile(
      join(acme, "providers", "ollama.yaml"),
      "id: ollama\ntype: ollama\nlocal: true\n",
    );

    const read = await watched.trustedVersionOf(savedRun);

    expect(checked).toEqual([["mock", "ollama"]]);
    expect(read.trust).toBe(contractGrant);
    expect(providersOf(read.workspace)).toEqual(["mock", "ollama"]);
    // Reading a run's version for its connectors starts no run from it.
    expect(providersOf(watched.latest())).toEqual(["mock"]);
  });

  it("gives no grant until the watch sets its checks", async () => {
    const watched = await watchAcme();

    const read = await watched.trustedVersionOf(savedRun);

    expect(read.trust).toBeNull();
  });

  it("refuses a run's version that turns local only off, before its trust check", async () => {
    const watched = await watchAcme();
    let checks = 0;
    watched.checkWith({
      trust: async () => {
        checks += 1;
        return contractGrant;
      },
      sandbox: async () => {},
    });
    const file = join(acme, "workspace.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("localOnly: true", "localOnly: false"),
    );

    await expect(watched.trustedVersionOf(savedRun)).rejects.toThrow("turns local only on or off");
    expect(checks).toBe(0);
  });

  it("gives a run's connectors the load its definitions came from, not an edit made since", async () => {
    const watched = await watchAcme();
    const checked: string[][] = [];
    watched.checkWith({
      trust: async (workspace) => {
        checked.push(providersOf(workspace));
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await watched.definitionsOf("support", "support-reply", savedRun.version, savedRun.runId);
    await writeFile(
      join(acme, "providers", "ollama.yaml"),
      "id: ollama\ntype: ollama\nlocal: true\n",
    );

    const read = await watched.trustedVersionOf(savedRun);

    expect(providersOf(read.workspace)).toEqual(["mock"]);
    // Trust is checked again, on the kept load, not on the edited files.
    expect(checked).toEqual([["mock"], ["mock"]]);
  });

  it("reads the saved files as they are now for a run it didn't start, or one that ended", async () => {
    const watched = await watchAcme();
    await watched.definitionsOf("support", "support-reply", savedRun.version, savedRun.runId);
    await writeFile(
      join(acme, "providers", "ollama.yaml"),
      "id: ollama\ntype: ollama\nlocal: true\n",
    );

    const older = await watched.trustedVersionOf({ ...savedRun, runId: "older" });
    watched.forget(savedRun.runId);
    const ended = await watched.trustedVersionOf(savedRun);

    expect(providersOf(older.workspace)).toEqual(["mock", "ollama"]);
    expect(providersOf(ended.workspace)).toEqual(["mock", "ollama"]);
  });

  it("gives a run's agent file as its version had it, not as an edit made since", async () => {
    const watched = await watchAcme();
    const agent = filesOf(watched.latest(), "agent")[0];
    if (agent === undefined) throw new Error("Acme has no agent.");
    const before = await readFile(join(acme, agent.path), "utf8");
    await watched.definitionsOf("support", "support-reply", savedRun.version, savedRun.runId);
    await writeFile(join(acme, agent.path), `${before}# edited since\n`);

    const bytes = await watched.agentFileOf(savedRun, agent.hub ?? "", agent.value.id);

    expect(new TextDecoder().decode(bytes)).toBe(before);
  });

  it("gives a child run's agent file from its own version, after a newer one was read", async () => {
    const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
    const git = await testGit();
    const vcs = new GitVcs(acme, {
      runner: await GitRunner.create({ git }),
      author: { name: "Test", email: "test@example.com" },
    });
    await vcs.init();
    const agent = filesOf(await loadWorkspace(dir.store), "agent")[0];
    if (agent === undefined) throw new Error("Acme has no agent.");
    const first = await commitAll(vcs, dir.store);
    const firstText = await readFile(join(acme, agent.path), "utf8");
    versions = await WatchedVersions.open(dir, (root) => openGitHistory(root, { git }));
    // A newer version is made and read by another run, so `latest` is no longer the first one.
    await writeFile(join(acme, agent.path), `${firstText}# second version\n`);
    const second = await commitAll(vcs, dir.store);
    await versions.definitionsOf(
      "support",
      "support-reply",
      { reads: "live-version", commit: second, versionDate: "2026-11-10T09:42:00+01:00" },
      "run-2",
    );

    // The child run was never started by `definitionsOf`: it names its parent's version.
    const bytes = await versions.agentFileOf(
      {
        runId: "child-of-run-1",
        version: { reads: "live-version", commit: first, versionDate: "2026-11-10T09:42:00+01:00" },
      },
      agent.hub ?? "",
      agent.value.id,
    );

    expect(new TextDecoder().decode(bytes)).toBe(firstText);
    await expect(
      versions.agentFileOf(
        { runId: "child-of-run-1", version: null },
        agent.hub ?? "",
        agent.value.id,
      ),
    ).rejects.toThrow("doesn't name the version");
  });
});
