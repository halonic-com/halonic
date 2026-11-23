import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { RunVersion } from "@halonicjs/events";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeTestFolder } from "./test/remove-folder.ts";
import { type VersionRefusal, VersionRefusedError } from "./version-refused.ts";
import {
  type OpenWorkspaceHistory,
  type WatchedFolder,
  WatchedVersions,
} from "./watched-versions.ts";

// The version a run's connectors start from in a watch (HAL-7500): the one
// the run read, checked for trust, with the grant of that check. Moved here
// with the code from the CLI (HAL-17054); the CLI's tests check the words it
// says each refusal with.

const acmeExample = fileURLToPath(new URL("../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let dir: WatchedFolder;
let versions: WatchedVersions | undefined;
let runner: GitRunner | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-watched-versions-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  dir = { root: acme, shown: "./acme", store: new FolderDefinitionStore(acme) };
});

afterEach(async () => {
  await versions?.close();
  versions = undefined;
  await runner?.close();
  runner = undefined;
  await removeTestFolder(folder);
});

/** Acme's versions with history off: the saved files. */
async function watchAcme(): Promise<WatchedVersions> {
  versions = await WatchedVersions.open(dir, async () => null);
  return versions;
}

/** Acme under git, not committed yet, and an opener of its history as the watch opens it. */
async function acmeUnderGit(): Promise<{ vcs: GitVcs; openHistory: OpenWorkspaceHistory }> {
  const git = await testGit();
  runner = await GitRunner.create({ git });
  const vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
  await vcs.init();
  const openHistory: OpenWorkspaceHistory = async () => {
    const own = await GitRunner.create({ git });
    const read = new GitVcs(acme, {
      runner: own,
      author: { name: "Test", email: "test@example.com" },
    });
    return { vcs: read, close: () => own.close() };
  };
  return { vcs, openHistory };
}

/** Commits every file in the workspace as a new version and gives its version. */
async function commitAll(vcs: GitVcs): Promise<RunVersion> {
  await vcs.stage(await dir.store.list());
  const commit = await vcs.commit("A version");
  return { reads: "live-version", commit, versionDate: "2026-11-10T09:42:00+01:00" };
}

/** The refusal `action` throws; fails the test when it throws anything else. */
async function refusalOf(action: () => Promise<unknown>): Promise<VersionRefusal> {
  const error = await action().then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof VersionRefusedError)) throw new Error(`Not a refusal: ${String(error)}`);
  return error.refusal;
}

/** Each test starts a real git repository and commits, which can take longer than 5 s on a busy runner. */
const slowTest = { timeout: 60_000 };

/** A run that read the saved files. */
const savedRun = { runId: "run-1", version: { reads: "saved-files" } } as const;

/** The ids of the workspace's provider files. */
function providersOf(workspace: LoadedWorkspace): string[] {
  return filesOf(workspace, "provider").map((file) => file.value.id);
}

/** Adds a local provider to the saved files. */
async function addOllama(): Promise<void> {
  await writeFile(
    join(acme, "providers", "ollama.yaml"),
    "id: ollama\ntype: ollama\nlocal: true\n",
  );
}

/** Turns local only off in the saved workspace.yaml. */
async function turnOffLocalOnly(): Promise<void> {
  const file = join(acme, "workspace.yaml");
  await writeFile(
    file,
    (await readFile(file, "utf8")).replace("localOnly: true", "localOnly: false"),
  );
}

verifies("cli.local-engine", () => {
  it("gives a run's version with the grant of its own trust check, not the one read last", async () => {
    const watched = await watchAcme();
    const checked: string[][] = [];
    watched.checkWith({
      trust: async ({ workspace }) => {
        checked.push(providersOf(workspace));
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await addOllama();

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

  it("gives the live version only while it passes the trust check a run's version passes", async () => {
    const watched = await watchAcme();
    let trusted = true;
    watched.checkWith({
      trust: async () => {
        if (!trusted) throw new Error("not trusted here");
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await addOllama();

    const live = await watched.trustedLive();
    expect(live === null ? null : providersOf(live)).toEqual(["mock", "ollama"]);
    expect(providersOf(await watched.live())).toEqual(["mock", "ollama"]);

    trusted = false;
    expect(await watched.trustedLive()).toBeNull();
  });

  it("gives no live version that turns local only off, before its trust check", async () => {
    const watched = await watchAcme();
    let checks = 0;
    watched.checkWith({
      trust: async () => {
        checks += 1;
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await turnOffLocalOnly();

    expect(await watched.trustedLive()).toBeNull();
    expect(checks).toBe(0);
  });

  it("gives a run's connectors the load its definitions came from, not an edit made since", async () => {
    const watched = await watchAcme();
    const checked: string[][] = [];
    watched.checkWith({
      trust: async ({ workspace }) => {
        checked.push(providersOf(workspace));
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await watched.definitionsOf("support", "support-reply", savedRun.version, savedRun.runId);
    await addOllama();

    const read = await watched.trustedVersionOf(savedRun);

    expect(providersOf(read.workspace)).toEqual(["mock"]);
    // Trust is checked again, on the kept load, not on the edited files.
    expect(checked).toEqual([["mock"], ["mock"]]);
  });

  it("reads the saved files as they are now for a run it didn't start, or one that ended", async () => {
    const watched = await watchAcme();
    await watched.definitionsOf("support", "support-reply", savedRun.version, savedRun.runId);
    await addOllama();

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

  it("gives a run's skill as its version had it, the hub's own before the shared one", async () => {
    const skill = (hub: string | null, text: string) => ({
      path: join(acme, ...(hub === null ? [] : ["hubs", hub]), "library", "skills", "tone"),
      text: `---\nname: Tone\ndescription: Kind and short.\n---\n${text}\n`,
    });
    for (const { path, text } of [skill(null, "Shared."), skill("support", "Support's own.")]) {
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "SKILL.md"), text);
    }
    const watched = await watchAcme();
    await watched.definitionsOf("support", "support-reply", savedRun.version, savedRun.runId);
    await writeFile(join(skill(null, "").path, "SKILL.md"), "Edited since.\n");

    expect(await watched.skillTextOf(savedRun, "support", "tone")).toContain("Support's own.");
    expect(await watched.skillTextOf(savedRun, "reports", "tone")).toContain("Shared.");
  });

  it(
    "gives a child run's agent file from its own version, after a newer one was read",
    slowTest,
    async () => {
      const { vcs, openHistory } = await acmeUnderGit();
      const first = await commitAll(vcs);
      versions = await WatchedVersions.open(dir, openHistory);
      const agent = filesOf(versions.latest(), "agent")[0];
      if (agent === undefined) throw new Error("Acme has no agent.");
      const firstText = await readFile(join(acme, agent.path), "utf8");
      // A newer version is made and read by another run, so `latest` is no longer the first one.
      await writeFile(join(acme, agent.path), `${firstText}# second version\n`);
      const second = await commitAll(vcs);
      await versions.definitionsOf("support", "support-reply", second, "run-2");
      expect(await versions.routinesNotLive(versions.latest())).toEqual([]);

      // The child run was never started by `definitionsOf`: it names its parent's version.
      const child = { runId: "child-of-run-1", version: first };
      const bytes = await versions.agentFileOf(child, agent.hub ?? "", agent.value.id);

      expect(new TextDecoder().decode(bytes)).toBe(firstText);
    },
  );
});

verifies("workspace-engine-node.version-refusals", () => {
  it("refuses a history it can't open, keeping the history's error as the cause", async () => {
    const gitFailed = new Error("spawn git ENOENT");
    const error = await WatchedVersions.open(dir, async () => {
      throw gitFailed;
    }).catch((thrown: unknown) => thrown);
    if (!(error instanceof VersionRefusedError)) throw new Error("Not a refusal.");
    expect(error.refusal).toEqual({ reason: "history-unavailable" });
    expect(error.kind).toBe("unavailable");
    expect(error.cause).toBe(gitFailed);
  });

  it("refuses a workspace with history that has nothing live yet", slowTest, async () => {
    const { openHistory } = await acmeUnderGit();
    expect(await refusalOf(() => WatchedVersions.open(dir, openHistory))).toEqual({
      reason: "nothing-live",
    });
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
    await turnOffLocalOnly();

    expect(await refusalOf(() => watched.trustedVersionOf(savedRun))).toEqual({
      reason: "local-only-changed",
      savedNow: false,
      savedAtStart: false,
    });
    expect(checks).toBe(0);
  });

  it("refuses an agent file for a run that names no version it can read", async () => {
    const watched = await watchAcme();
    const run = { runId: "run-1", version: null };
    expect(await refusalOf(() => watched.agentFileOf(run, "support", "writer"))).toEqual({
      reason: "no-version-for-agent-file",
      runId: "run-1",
    });
  });

  it("refuses a skill or agent the version doesn't have, naming the hub and the id", async () => {
    const watched = await watchAcme();
    expect(await refusalOf(() => watched.skillTextOf(savedRun, "support", "missing"))).toEqual({
      reason: "no-skill",
      hubId: "support",
      skillId: "missing",
    });
    expect(await refusalOf(() => watched.agentFileOf(savedRun, "support", "missing"))).toEqual({
      reason: "no-agent-file",
      hubId: "support",
      agentId: "missing",
    });
  });

  it("refuses a commit with history off, naming the commit", async () => {
    const watched = await watchAcme();
    const version: RunVersion = {
      reads: "live-version",
      commit: "abc1234",
      versionDate: "2026-11-23T00:00:00Z",
    };
    expect(await refusalOf(() => watched.trustedVersionOf({ runId: "run-1", version }))).toEqual({
      reason: "no-history-for-version",
      commit: "abc1234",
    });
  });
});
