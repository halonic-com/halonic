import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryAgentPlacementStore, MemoryTrustStore } from "@halonicjs/adapter-memory";
import { AgentPlacement } from "@halonicjs/app";
import type { Clock, SandboxProfile, TrustStore } from "@halonicjs/ports";
import { agentsTrustContent, filesOf, loadWorkspace } from "@halonicjs/workspace";
import type { BuiltProfile } from "../harness/host-profiles.ts";
import { webCryptoDigest } from "../harness/host-profiles.ts";
import { UnfencedGate, type UnfencedGateOptions } from "./unfenced-gate.ts";

export const coderPath = "hubs/lab/agents/coder.agent.yaml";
export const coderText =
  "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\n";
/** An agent in Halonic's own loop: it names no harness, so it starts no program. */
export const plannerPath = "hubs/lab/agents/planner.agent.yaml";

const clock: Clock = { now: () => new Date("2026-11-22T09:00:00.000Z") };

/** A workspace with the coder, the stores the host reads, and the gate over them. */
export interface ThisComputerSetup {
  readonly root: string;
  readonly trust: MemoryTrustStore;
  readonly placements: MemoryAgentPlacementStore;
  /** The profiles the host "built", by temp folder; the gate reads them as unopened. */
  readonly unopened: Map<string, BuiltProfile>;
  /** A profile the host built for the coder, kept in `unopened`. */
  readonly built: BuiltProfile;
  /** The instruction folders the host "made"; the built profile's is one. */
  readonly madeInstructions: Set<string>;
  readonly gate: UnfencedGate;
  /** A gate over the same workspace and profiles, but with another trust store. */
  gateWith(trustStore: TrustStore | undefined): UnfencedGate;
  /** Saves a trust record that lists the coder as its file is now. */
  trustCoder(): Promise<void>;
  /** Saves the person's "On this computer" choice for an agent's file as it is now; the coder's by default. */
  chooseThisComputer(agent?: "coder" | "planner"): Promise<void>;
  /** Writes the coder's file. */
  writeCoder(text: string): Promise<void>;
  close(): Promise<void>;
}

export async function thisComputerSetup(): Promise<ThisComputerSetup> {
  const base = await realpath(await mkdtemp(join(tmpdir(), "agent-host-this-computer-")));
  const root = join(base, "acme");
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\ndescription: An invented shop.\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\ndescription: Where the coder changes a file.\n",
    [coderPath]: coderText,
    [plannerPath]: "id: planner\nname: Planner\ninstructions: Plan the change.\n",
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const trust = new MemoryTrustStore();
  const placements = new MemoryAgentPlacementStore();
  const built = builtFor(root);
  const unopened = new Map([[built.profile.tempFolder, built]]);
  const madeInstructions = new Set([built.instructionsFolder ?? ""]);
  const options: UnfencedGateOptions = {
    workspaceRoots: [root],
    trustStore: trust,
    placements,
    profiles: { unopened: (tempFolder) => unopened.get(tempFolder) },
    instructions: { isMade: (folder) => madeInstructions.has(folder) },
    digest: webCryptoDigest,
    clock,
  };
  const gate = new UnfencedGate(options);
  const placement = new AgentPlacement({ store: placements, digest: webCryptoDigest, clock });
  return {
    root,
    trust,
    placements,
    unopened,
    built,
    madeInstructions,
    gate,
    gateWith: (trustStore) => new UnfencedGate({ ...options, trustStore }),
    trustCoder: async () => {
      const workspace = await loadWorkspace(new FolderDefinitionStore(root, root));
      const agents = filesOf(workspace, "agent").map((each) => each.value);
      await trust.grant({
        location: root,
        fingerprint: "hfp1:test",
        content: { connectors: [], agents: agentsTrustContent(agents) },
        grantedAt: "2026-11-22T08:00:00.000Z",
        appVersion: "0.1.0",
        pins: {},
        origin: "prompt",
      });
    },
    chooseThisComputer: async (agent = "coder") => {
      const path = agent === "coder" ? coderPath : plannerPath;
      const file = new Uint8Array(await readFile(join(root, path)));
      const subject = { location: root, hub: "lab", agent, file };
      const shown = await placement.where(subject);
      await placement.chooseThisComputer(subject, shown.agentFingerprint);
    },
    writeCoder: (text) => writeFile(join(root, coderPath), text),
    close: () => rm(base, { recursive: true, force: true }),
  };
}

/** A profile as the host builds it for the coder in `root`. */
function builtFor(root: string): BuiltProfile {
  const profile: SandboxProfile = {
    workingFolder: join(root, "files", "agents", "coder"),
    tempFolder: join(root, ".halonic-test", "tmp-1"),
    settingsFolder: join(root, ".halonic-test", "settings"),
    readOnlyPaths: [],
    deniedPaths: [],
    env: { PATH: "/usr/bin", HOME: "/srv/acme-home" },
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
  };
  return {
    workspace: root,
    agent: {
      runId: "run_1",
      hubId: "lab",
      agentId: "coder",
      harness: "claude-code",
      workingFolder: null,
      allowedSites: [],
      filesFolder: null,
    },
    instructionsFolder: join(root, ".halonic-test", "instructions-1"),
    profile,
  };
}
