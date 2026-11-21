import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories, WorkflowRuns } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import {
  type ConnectorFactory,
  type Harness,
  type HarnessBridge,
  type HarnessBridgeServer,
  type HttpClient,
  harnessBridgeTokenHeader,
  type KeyOrigins,
  noKeyOrigins,
  type Sandbox,
  type SandboxProfile,
  type Secrets,
  type TrustGrant,
} from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { type LocalEngine, openLocalEngine } from "../local-engine-host.ts";
import type { LocalHarnessInput, LocalHarnessParts } from "../local-harness-host.ts";
import { nodeProfileEnvironment } from "../workspace-runs.ts";
import { removeTestFolder } from "./remove-folder.ts";
import { trustInstructions } from "./trust-instructions.ts";

const acmeExample = fileURLToPath(new URL("../../../../examples/acme", import.meta.url));
export const gitTimeout = 30_000;
export const agentFile = "files/agents/coder/change.txt";

export let folder: string;
export let acme: string;
export let profile: ProfileEnvironment;
export let reported: unknown[];
const opened: LocalEngine[] = [];

/** Makes a fresh workspace and profile with the coder's instructions trusted; the test calls it before each test. */
export async function setUpRig(): Promise<void> {
  // Short names, so a run's bridge socket in the profile fits macOS's 103 bytes even under its long temp folder.
  folder = await mkdtemp(join(tmpdir(), "hh-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "p") } };
  reported = [];
  await addLab();
  // A person trusted the coder's instructions as the lab has them.
  await trustCoderInstructions("Write the change.");
}

/** Closes the engines and removes the rig's folders; the test calls it after each test. */
export async function tearDownRig(): Promise<void> {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  // On Windows a file the engine just deleted can stay "delete pending", so a plain `rm` fails with ENOTEMPTY (HAL-9217).
  await removeTestFolder(folder);
}

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

/** Records, as a person's yes, that the coder's instructions are `text`. */
export function trustCoderInstructions(text: string): Promise<void> {
  return trustInstructions({ profile, workspace: acme, agent: "coder", text });
}

/** Puts the workspace in git with one commit, and gives that version. */
export async function commitWorkspace(): Promise<RunVersion> {
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
export interface Program {
  /** Runs once the program has started, with its sandbox profile and, on the Node bridge, the bridge it was given. */
  readonly onStart: (profile: SandboxProfile, bridge?: HarnessBridge) => Promise<void>;
  /** Holds the program until its call is cancelled, as a stuck one would. */
  readonly hangs?: boolean;
}

export interface Fakes {
  readonly parts: LocalHarnessParts;
  readonly profiles: SandboxProfile[];
  /** Where each connector program of a run started: the folder its copy is in. */
  readonly connectorFolders: string[];
  readonly connectorsClosed: string[];
  readonly started: Promise<void>;
  /** How many times the fake program started. */
  programStarts: number;
  /** The instructions each started program was given. */
  readonly instructions: string[];
  /** The bridge each program was given, on the Node bridge. */
  readonly bridges: HarnessBridge[];
}

/**
 * The fakes of a run's program. With `bridge: "node"`, the CLI's own Node
 * bridge serves the run on its socket, and the fake program gets the
 * bridge's address and run token in its environment, as Claude Code's are.
 */
export function fakesFor(program: Program, options: { bridge?: "fake" | "node" } = {}): Fakes {
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
    environment: (bridge) => {
      if (options.bridge !== "node") return {};
      fakes.bridges.push(bridge);
      return {
        ANTHROPIC_BASE_URL: bridge.url,
        ANTHROPIC_CUSTOM_HEADERS: `${harnessBridgeTokenHeader}: ${bridge.token}`,
      };
    },
    start: (task, session) => {
      fakes.programStarts += 1;
      fakes.instructions.push(task.instructions);
      const cancelled = Promise.withResolvers<void>();
      return {
        async *[Symbol.asyncIterator]() {
          await program.onStart(session.profile, fakes.bridges.at(-1));
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
  const fakes: Fakes = {
    parts: {
      fenced: recording,
      launcher: recording,
      harnesses: { "claude-code": harness },
      ...(options.bridge === "node" ? {} : { bridgeServer }),
      platform: "linux",
    },
    profiles,
    connectorFolders: [],
    connectorsClosed: [],
    started: started.promise,
    programStarts: 0,
    instructions: [],
    bridges: [],
  };
  return fakes;
}

/** What a test that serves a key gives the engine instead of the kit's: no secrets, no network. */
export interface EngineKeys {
  readonly secrets?: Secrets;
  readonly http?: HttpClient;
  readonly keyOrigins?: KeyOrigins;
  /** Whether the workspace is trusted on this computer; trusted unless a test says otherwise. */
  readonly trusted?: boolean;
  readonly reportAccess?: LocalHarnessInput["reportAccess"];
}

/** @param trust - the grant the connectors' programs run with; a test gives its own */
export async function openEngine(
  fakes: Fakes,
  trust: TrustGrant,
  git = true,
  keys: EngineKeys = {},
): Promise<LocalEngine> {
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
    secrets: keys.secrets ?? { get: async () => null },
    keyOrigins: keys.keyOrigins ?? noKeyOrigins,
    http: keys.http ?? {
      fetch: () => Promise.reject(new TypeError("The test model calls no server.")),
    },
    trusted: keys.trusted ?? true,
    ...(keys.reportAccess === undefined ? {} : { reportAccess: keys.reportAccess }),
    environment: profile,
    harnessParts: fakes.parts,
    ...(git ? { git: { git: await testGit() } } : {}),
    runConnectors: {
      factories: new ConnectorFactories([notes]),
      context: {
        http: { fetch: () => Promise.reject(new TypeError("no server")) },
        tokens: new MemoryTokenStore(),
      },
      trust,
    },
    reportError: (error) => reported.push(error),
  });
  opened.push(engine);
  return engine;
}

/** The workspace's folder in the profile. */
export async function workspaceFolderInProfile(): Promise<string> {
  const workspaces = join(profileFolder(profile).root, "workspaces");
  const [key] = await readdir(workspaces);
  return join(workspaces, key ?? "");
}

export async function entriesOf(path: string): Promise<string[]> {
  return await readdir(path).catch(() => []);
}

/** Runs Change to its end on `version` and gives the run's id and what became of it. */
export async function runChange(engine: LocalEngine, version: RunVersion) {
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
