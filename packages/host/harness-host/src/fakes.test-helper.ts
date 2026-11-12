// Small fakes of the ports the builder takes. Deliberate fakes: a host
// package may not use adapters, not even in tests.

import type { HarnessAgent } from "@halonicjs/engine";
import type {
  AgentPlacementKey,
  AgentPlacementRecord,
  AgentPlacementStore,
  BridgeApprovals,
  BridgeTools,
  Clock,
  DefinitionStore,
  Digest,
  HarnessBridgeOptions,
  HarnessBridgeServer,
  OpenHarnessBridge,
} from "@halonicjs/ports";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

export const clock: Clock = { now: () => new Date("2026-11-11T10:00:00.000Z") };

/** The person's choices, in memory. */
export class MemoryPlacementStore implements AgentPlacementStore {
  readonly #saved = new Map<string, AgentPlacementRecord>();

  async get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null> {
    return this.#saved.get(idOf(key)) ?? null;
  }

  async save(placement: AgentPlacementRecord): Promise<void> {
    this.#saved.set(idOf(placement), { ...placement });
  }

  async remove(key: AgentPlacementKey): Promise<void> {
    this.#saved.delete(idOf(key));
  }
}

function idOf(key: AgentPlacementKey): string {
  return JSON.stringify([key.location, key.agent]);
}

/** Workspace files in memory, enough for the proposal records. */
export class MemoryDefinitionStore implements DefinitionStore {
  readonly location = "memory:test";
  readonly files = new Map<string, string>();

  async list(dir?: string): Promise<string[]> {
    const prefix = dir === undefined ? "" : `${dir}/`;
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async version(): Promise<string> {
    return "memory";
  }

  async write(path: string, content: string): Promise<{ status: "written" }> {
    this.files.set(path, content);
    return { status: "written" };
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async watch(): Promise<{ close(): Promise<void> }> {
    return { close: async () => {} };
  }
}

/** A bridge server that records what each `open` was given. */
export class RecordingBridgeServer implements HarnessBridgeServer {
  readonly opened: HarnessBridgeOptions[] = [];

  async open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge> {
    this.opened.push(options);
    return { url: "http://127.0.0.1:4100", token: "test-token", close: async () => {} };
  }
}

export const noTools: BridgeTools = {
  list: async () => [],
  check: async () => ({ kind: "refused", reason: "No tools." }),
  call: async () => ({ result: "No tools.", outcome: "error" }),
};

export const approveAll: BridgeApprovals = {
  request: async () => ({ approved: true }),
};

/**
 * The agent `agentId` of run `01JD8Q` in the `support` hub, running in Claude
 * Code, with the format's defaults as its file.
 */
export function harnessAgentOf(agentId: string, filesFolder: string | null): HarnessAgent {
  const file: HarnessAgent["file"] = {
    version: 1,
    id: agentId,
    name: agentId,
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
    harness: "claude-code",
  };
  return { runId: "01JD8Q", hubId: "support", agentId, harness: "claude-code", file, filesFolder };
}
