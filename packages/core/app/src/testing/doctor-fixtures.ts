import type { Agent } from "@halonicjs/format";
import type { HarnessDetection, SandboxCheck, Secrets } from "@halonicjs/ports";
import { ok } from "@halonicjs/std";
import type { NetworkProblem, NodeProblem } from "../doctor-lines.ts";
import { type DoctorProvider, DoctorService, type DoctorWorkspace } from "../doctor-service.ts";
import type { DoctorHarness } from "../doctor-sign-ins.ts";
import type { TimedOutLine } from "../doctor-time-limit.ts";
import type { ProviderModels, Resources } from "../resource-report.ts";
import type { SandboxChoice } from "../sandbox-choice.ts";
import type { TrustCheck } from "../trust-service.ts";
import { HandTimers } from "./hand-timers.ts";

// Providers, agents, workspaces and a doctor on a test machine, for the doctor service's tests.

export const ready: SandboxCheck = { ok: true, reason: null, missing: [] };
export const llama = { name: "llama3.2", memoryBytes: 2_000_000_000 };

export const ollama: DoctorProvider = {
  provider: "ollama",
  name: "Ollama",
  runs: "on-this-computer",
  address: "localhost:11434",
};
export const anthropic: DoctorProvider = {
  provider: "anthropic",
  name: "Anthropic",
  runs: "with-a-key",
  secret: "ANTHROPIC_API_KEY",
};

/** An agent of the workspace, in Halonic's own loop unless a harness is given. */
export function agent(name: string, harness?: Agent["harness"]): Agent {
  return {
    version: 1,
    id: name.toLowerCase(),
    name,
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    ...(harness === undefined ? {} : { harness, allowedSites: [] }),
  };
}

export function workspace(
  parts: Partial<DoctorWorkspace> & { agents?: Agent[] } = {},
): DoctorWorkspace {
  return {
    name: "acme",
    trust: {
      location: "/work/acme",
      connectors: [],
      commandPaths: new Map(),
      agents: parts.agents ?? [],
      integrations: [],
      providers: [],
    },
    aliases: parts.aliases ?? [],
    providers: parts.providers ?? [],
    ...(parts.testModelOnly === undefined ? {} : { testModelOnly: parts.testModelOnly }),
    ...(parts.windowsDrive === undefined ? {} : { windowsDrive: parts.windowsDrive }),
    ...(parts.tooManyFilesToWatch === undefined
      ? {}
      : { tooManyFilesToWatch: parts.tooManyFilesToWatch }),
  };
}

interface Machine {
  trust?: TrustCheck["status"];
  sandbox?: SandboxCheck;
  freeBytes?: number;
  models?: ProviderModels[];
  codex?: HarnessDetection;
  /** Codex as a whole, in place of one that only answers `codex`. */
  codexHarness?: DoctorHarness;
  /** The sandbox choice; the host has none when left out. */
  choice?: SandboxChoice | null;
  secrets?: Record<string, string>;
  /** What the host found wrong with Node.js; the host checks nothing when left out. */
  node?: NodeProblem | null;
  /** What the host found wrong with the network settings; the host checks nothing when left out. */
  network?: NetworkProblem | null;
  /** The sandbox check as a whole, in place of one that answers `sandbox`. */
  sandboxCheck?: () => Promise<SandboxCheck>;
  /** The resource report's read, in place of one that answers at once. */
  read?: () => Promise<Resources>;
}

/** A doctor on a machine with plenty of disk and a working sandbox, unless told otherwise. */
export function doctor(machine: Machine = {}) {
  const asked: string[] = [];
  const resources: Resources = {
    at: "2026-11-10T09:00:00.000Z",
    memory: ok({ engineBytes: 0, processes: [], totalBytes: 0 }),
    data: [],
    disk: ok({
      freeBytes: machine.freeBytes ?? 50e9,
      low: (machine.freeBytes ?? 50e9) < 1024 ** 3,
    }),
    models: machine.models ?? [],
    waits: ok([]),
  };
  const secrets: Secrets = {
    get: async (name) => {
      asked.push(name);
      return machine.secrets?.[name] ?? null;
    },
  };
  const timers = new HandTimers();
  const service = new DoctorService({
    trust: { check: async () => ({ status: machine.trust ?? "trusted" }) },
    sandbox: {
      check: machine.sandboxCheck ?? (async () => machine.sandbox ?? ready),
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    resources: { read: machine.read ?? (async () => resources) },
    harnesses: [
      machine.codexHarness ?? {
        id: "codex",
        name: "Codex",
        detect: async () => machine.codex ?? { status: "missing" },
      },
    ],
    secrets,
    ...(machine.choice === undefined
      ? {}
      : { sandboxChoice: { current: () => machine.choice ?? null } }),
    ...(machine.node === undefined ? {} : { node: async () => machine.node ?? null }),
    ...(machine.network === undefined ? {} : { network: () => machine.network ?? null }),
    timers,
  });
  return { service, asked, timers };
}

/** A line that answered in time, so its own fields can be checked; a timed-out one fails the test. */
export function answered<Line extends object>(line: Line | undefined): Exclude<Line, TimedOutLine> {
  if (line === undefined || "timedOut" in line) {
    throw new Error(`expected a line that answered, got ${JSON.stringify(line)}`);
  }
  return line as Exclude<Line, TimedOutLine>;
}
