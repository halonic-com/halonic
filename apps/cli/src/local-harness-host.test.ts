import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories, WorkflowRuns } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import { ProposalsNeedHistoryError } from "@halonicjs/host-harness-host";
import type {
  ConnectorFactory,
  Harness,
  HarnessBridgeServer,
  Sandbox,
  SandboxProfile,
} from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type LocalEngine, openLocalEngine } from "./local-engine-host.ts";
import type { LocalHarnessParts } from "./local-harness-host.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

// The CLI's harness host (HAL-7747), run through the real engine on real
// folders: the Node parts that would start a program are fakes, and what the
// fake program does to the disk is what the tests look at.

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const gitTimeout = 30_000;
const agentFile = "files/agents/coder/change.txt";

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let reported: unknown[];
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-harness-host-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  reported = [];
  await addLab();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await rm(folder, { recursive: true, force: true });
});

/** A hub whose helper calls the `notes` connector, then whose coder runs in Claude Code. */
async function addLab(): Promise<void> {
  const files: Record<string, string> = {
    // Harness agents send their work to a cloud model, which a local-only workspace refuses.
    "workspace.yaml":
      "id: acme\nname: Acme\ndescription: An invented shop.\nprivacy:\n  localOnly: false\ndefaults:\n  model: default\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\ndescription: Where the coder changes a file.\n",
    "hubs/lab/agents/helper.agent.yaml":
      "id: helper\nname: Helper\nconnectors: [notes]\ninstructions: Ask the notes.\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\n",
    "library/connectors/notes.connector.yaml":
      "id: notes\nname: Notes\ntransport:\n  stdio:\n    command: node\ntools:\n  allow: [which]\n  read: [which]\n",
    "providers/mock.yaml":
      'id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    helper: ["tool:which {}", "Done"]\n',
    "hubs/lab/workflows/change.workflow.yaml": [
      "id: change",
      "name: Change",
      "initial: ask",
      "start: { label: Ask for a change, field: note }",
      "states:",
      "  ask:",
      "    description: Ask the notes",
      "    agent: helper",
      "    input: Ask the notes.",
      "    output: notes",
      "    on:",
      "      - to: code",
      "  code:",
      "    description: Write the file",
      "    agent: coder",
      "    input: Write the change.",
      "    output: change",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "    description: Done",
      "",
    ].join("\n"),
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
}

/** Puts the workspace in git with one commit, and gives that version. */
async function commitWorkspace(): Promise<RunVersion> {
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const vcs = new GitVcs(acme, {
      runner,
      author: { name: "Test", email: "test@example.com" },
    });
    await vcs.init();
    await vcs.stage(await new FolderDefinitionStore(acme).list());
    const commit = await vcs.commit("First version");
    return { reads: "live-version", commit, versionDate: "2026-11-12T09:00:00.000Z" };
  } finally {
    await runner.close();
  }
}

/** What the fake program does in its working folder, and what the fakes saw. */
interface Program {
  /** Runs once the program has started, with its sandbox profile. */
  readonly onStart: (profile: SandboxProfile) => Promise<void>;
  /** Holds the program until its call is cancelled, as a stuck one would. */
  readonly hangs?: boolean;
}

interface Fakes {
  readonly parts: LocalHarnessParts;
  readonly profiles: SandboxProfile[];
  /** Where each connector program of a run started: the folder its copy is in. */
  readonly connectorFolders: string[];
  readonly connectorsClosed: string[];
  readonly started: Promise<void>;
}

function fakesFor(program: Program): Fakes {
  const profiles: SandboxProfile[] = [];
  const started = Promise.withResolvers<void>();
  // Starts no program, as the fake program is in this process; it only says it is fenced.
  const recording: Sandbox = {
    check: async () => ({ ok: true, reason: null, missing: [] }),
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async (given) => {
      profiles.push(given);
      return {
        profile: given,
        fence: { state: "fenced" },
        start: async () => {
          throw new Error("The fake sandbox starts no program.");
        },
        onBlocked: () => () => {},
        close: async () => {},
      };
    },
  };
  const harness: Harness = {
    id: "claude-code",
    name: "Claude Code",
    detect: async () => ({ status: "ready", version: "1.0.0" }),
    environment: () => ({}),
    start: (task, session) => {
      const cancelled = Promise.withResolvers<void>();
      return {
        async *[Symbol.asyncIterator]() {
          await program.onStart(session.profile);
          started.resolve();
          if (program.hangs === true) {
            await cancelled.promise;
            throw new Error("The run was cancelled.");
          }
          yield { type: "agent.finished", agent: task.agentId, output: "done" };
        },
        send: async () => {
          throw new Error("The fake program asks nothing.");
        },
        cancel: async () => cancelled.resolve(),
      };
    },
  };
  const bridgeServer: HarnessBridgeServer = {
    open: async () => ({
      url: "http://127.0.0.1:41817",
      token: "not-a-real-token",
      close: async () => {},
    }),
  };
  return {
    parts: {
      fenced: recording,
      launcher: recording,
      harnesses: { "claude-code": harness },
      bridgeServer,
      platform: "linux",
    },
    profiles,
    connectorFolders: [],
    connectorsClosed: [],
    started: started.promise,
  };
}

async function openEngine(fakes: Fakes, git = true): Promise<LocalEngine> {
  const notes: ConnectorFactory = {
    transport: "stdio",
    create: (config, context) => {
      fakes.connectorFolders.push(context.workspaceRoot ?? "");
      return {
        id: config.id,
        listTools: async () => [{ name: "which", description: "Says which.", parameters: {} }],
        callTool: async () => "the notes",
        close: async () => {
          fakes.connectorsClosed.push(config.id);
        },
      };
    },
  };
  const workspace: LoadedWorkspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  const engine = await openLocalEngine({
    workspace,
    workspaceRoot: acme,
    secrets: { get: async () => null },
    http: { fetch: () => Promise.reject(new TypeError("The test model calls no server.")) },
    environment: profile,
    harnessParts: fakes.parts,
    ...(git ? { git: { git: await testGit() } } : {}),
    runConnectors: {
      factories: new ConnectorFactories([notes]),
      context: {
        http: { fetch: () => Promise.reject(new TypeError("no server")) },
        tokens: new MemoryTokenStore(),
      },
      trust: contractGrant,
    },
    reportError: (error) => reported.push(error),
  });
  opened.push(engine);
  return engine;
}

/** The workspace's folder in the profile. */
async function workspaceFolderInProfile(): Promise<string> {
  const workspaces = join(profileFolder(profile).root, "workspaces");
  const [key] = await readdir(workspaces);
  return join(workspaces, key ?? "");
}

async function entriesOf(path: string): Promise<string[]> {
  return await readdir(path).catch(() => []);
}

/** Runs Change to its end on `version` and gives the run's id and what became of it. */
async function runChange(engine: LocalEngine, version: RunVersion) {
  const started = await engine.executor.start({
    hubId: "lab",
    workflowId: "change",
    input: { note: "Write change.txt" },
    version,
  });
  const run = await new WorkflowRuns(engine.executor).follow(started.id, {});
  // The run's folder and connectors end just after its last event: closing waits for them.
  await engine.close();
  return { runId: started.id, summary: run.summary };
}

verifies("cli.local-harness-host", () => {
  it(
    "keeps an agent's file out of a connector's copy, in the proposal folder until the run ends",
    async () => {
      const version = await commitWorkspace();
      const inConnectorCopy: boolean[] = [];
      const fakes = fakesFor({
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
          inConnectorCopy.push(
            ...fakes.connectorFolders.map((copy) => existsSync(join(copy, agentFile))),
          );
        },
      });
      const engine = await openEngine(fakes);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      // The connector started before the agent wrote, and the file never reached its copy.
      expect(inConnectorCopy).toEqual([false]);
      expect(fakes.connectorsClosed).toEqual(["notes"]);
      // Nor did it reach the workspace: it is only in the proposal.
      expect(existsSync(join(acme, agentFile))).toBe(false);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "takes the proposal before it releases the worktree",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
        },
      });
      const engine = await openEngine(fakes);

      const { runId } = await runChange(engine, version);

      const folders = await workspaceFolderInProfile();
      const record = await readFile(join(folders, "proposals", `${runId}.json`), "utf8");
      expect(record).toContain(agentFile);
      expect(await entriesOf(join(folders, "proposal-worktrees"))).toEqual([]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "runs and ends a harness run that writes no files, with no proposal",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      const folders = await workspaceFolderInProfile();
      expect(await entriesOf(join(folders, "proposals"))).toEqual([]);
      expect(await entriesOf(join(folders, "proposal-worktrees"))).toEqual([]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it("refuses a run whose folder can't be opened, saying how to turn history on", async () => {
    const fakes = fakesFor({ onStart: async () => {} });
    const engine = await openEngine(fakes, false);

    const refused = runChange(engine, { reads: "saved-files" });

    await expect(refused).rejects.toBeInstanceOf(ProposalsNeedHistoryError);
    await expect(refused).rejects.toThrow(/git init/);
    expect(fakes.profiles).toEqual([]);
  });

  it(
    "ends a harness run it found interrupted at the next start, keeping its proposal",
    async () => {
      const version = await commitWorkspace();
      const stuck = fakesFor({
        hangs: true,
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "half done");
        },
      });
      const first = await openEngine(stuck);
      // The run goes on while the program hangs, so the start doesn't come back until it is cancelled.
      const starting = first.executor.start({
        hubId: "lab",
        workflowId: "change",
        input: { note: "Write change.txt" },
        version,
      });
      await stuck.started;
      await first.close();
      await starting.catch(() => undefined);
      const [lost] = await first.runs.list({ status: "running" });
      if (lost === undefined) throw new Error("The first run isn't going.");

      const next = await openEngine(fakesFor({ onStart: async () => {} }));
      // The first run of the new engine ends what the last one lost.
      await next.executor.start({
        hubId: "support",
        workflowId: "support-reply",
        input: { mail: "Hi" },
      });

      expect(await next.runs.get(lost.id)).toMatchObject({ status: "failed" });
      const folders = await workspaceFolderInProfile();
      expect(await readFile(join(folders, "proposals", `${lost.id}.json`), "utf8")).toContain(
        agentFile,
      );
      expect(await entriesOf(join(folders, "proposal-worktrees"))).toEqual([]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "opens the engine when clearing what a harness run left fails, and reports it",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
        },
      });
      await runChange(await openEngine(fakes), version);
      // The proposal is kept, so the next start asks git, which can't read the workspace any more.
      await rm(join(acme, ".git"), { recursive: true, force: true });

      const next = await openEngine(fakesFor({ onStart: async () => {} }));

      expect(next.runs).toBeDefined();
      expect(reported).toHaveLength(1);
    },
    gitTimeout,
  );

  it(
    "denies a harness run the profile root, and writes only the run's own folders in it",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);

      await runChange(engine, version);

      const [given] = fakes.profiles;
      const root = await realpath(profileFolder(profile).root);
      expect(given?.deniedPaths).toContain(root);
      const writable = [
        given?.workingFolder,
        given?.tempFolder,
        given?.settingsFolder ?? undefined,
      ];
      for (const path of writable.filter((each) => each !== undefined)) {
        const inside = relative(root, path);
        expect(inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)).toBe(true);
        expect(given?.reopenedPaths ?? []).not.toContain(root);
      }
      // Every reopened path is one of the run's own, never the root or one of the engine's other folders.
      const folders = await realpath(await workspaceFolderInProfile());
      for (const path of given?.reopenedPaths ?? []) {
        expect(
          [join(folders, "proposal-worktrees"), join(folders, "harness-temp")].some((own) =>
            path.startsWith(`${own}/`),
          ),
        ).toBe(true);
      }
    },
    gitTimeout,
  );
});
