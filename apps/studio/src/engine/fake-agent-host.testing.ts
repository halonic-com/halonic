// An agent host in memory for the Studio's end-to-end tests (HAL-10849): it
// answers the routes the Studio's harness host calls as the real host does,
// and runs a Claude Code stand-in whose bridge asks for a person's OK on one
// Bash call. The real host's own side (Claude Code's permission prompt to
// `approvals.request`, its phone gateway to `approvals.remote-decision`) is
// tested in `apps/agent-host`; the apps can't import each other.

import type {
  AgentHostAnswer,
  AgentHostRequestRoute,
  AgentHostStreamAnswer,
  AgentHostStreamRoute,
  AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";

/** Claude Code's own id for the Bash call it asks about: the only id a phone is shown. */
export const bashCallId = "toolu_1";

/** The pin of the run's instructions the host wrote: one made-up digest, which the tests trust. */
const pinDigest = `sha256:${"a".repeat(64)}`;

/** The fields of a route's body the fake host reads; each route sends some of them. */
interface RouteBody {
  readonly workspace?: string;
  readonly run?: { readonly runId: string };
  readonly runId?: string;
  readonly call?: string;
  readonly result?: unknown;
  readonly error?: string;
}

/** Where the host makes a run's proposal folder, in its data folder. */
function proposalFolderOf(runId: string): string {
  return `/data/proposals/${runId}`;
}

/** What the bridge answered to Claude Code's question: the OK, or why not. */
export type BridgeAnswer =
  | { readonly approved: boolean }
  | { readonly error: string }
  | { readonly status: string };

/**
 * One NDJSON stream the fake host has open. Its lines end when the host ends
 * it, or when the caller hangs up through its signal, as the real host's do.
 */
class Lines {
  readonly #queue: unknown[] = [];
  #wake: (() => void) | undefined;
  #ended = false;

  constructor(signal: AbortSignal | undefined) {
    signal?.addEventListener("abort", () => this.end(), { once: true });
  }

  send(line: unknown): void {
    this.#queue.push(line);
    this.#wake?.();
  }

  end(): void {
    this.#ended = true;
    this.#wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    for (;;) {
      const line = this.#queue.shift();
      if (line !== undefined) {
        yield line;
        continue;
      }
      if (this.#ended) return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
      this.#wake = undefined;
    }
  }
}

/**
 * The agent host, as the Studio reaches it. It offers Claude Code in an srt
 * sandbox. Once the run starts, its bridge asks about one Bash call; the
 * run finishes once the bridge has answered, and ends as failed when it is
 * cancelled first.
 */
export class FakeAgentHost implements AgentHostTransport {
  /** What the bridge answered to Claude Code's question, once it has. */
  readonly answer: Promise<BridgeAnswer>;
  /** What the bridge answered to the phone's decision, once a phone decided. */
  readonly phoneAnswer: Promise<BridgeAnswer>;
  readonly #answered = Promise.withResolvers<BridgeAnswer>();
  readonly #phoneAnswered = Promise.withResolvers<BridgeAnswer>();
  /** The runs whose proposal folder the host has made, and not ended. */
  readonly #proposals = new Set<string>();
  #bridge: Lines | undefined;
  #run: Lines | undefined;

  constructor() {
    this.answer = this.#answered.promise;
    this.phoneAnswer = this.#phoneAnswered.promise;
  }

  /** A phone decides Claude Code's question: the host passes it on from its own gateway. */
  decideFromPhone(approved: boolean): void {
    if (this.#bridge === undefined) throw new Error("No bridge is open.");
    this.#bridge.send({
      type: "call",
      call: "c2",
      method: "approvals.remote-decision",
      params: { callId: bashCallId, approved, source: "remote-device" },
    });
  }

  async request(route: AgentHostRequestRoute, body?: unknown): Promise<AgentHostAnswer> {
    const answer = this.#routes[route];
    if (answer === undefined) return { status: 404, body: { kind: "not_found" } };
    return { status: 200, body: answer((body ?? {}) as RouteBody) };
  }

  async stream(
    route: AgentHostStreamRoute,
    _body: unknown,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentHostStreamAnswer> {
    const lines = new Lines(options?.signal);
    switch (route) {
      case "POST /v1/bridge/open":
        this.#bridge = lines;
        lines.send({ type: "opened", bridge: "b1", url: "http://127.0.0.1:4100", token: "t1" });
        break;
      case "POST /v1/harnesses/runs/start":
        this.#run = lines;
        lines.send({ type: "started", run: "h1" });
        // Claude Code's program is running now, and its permission prompt asks the bridge.
        this.#bridge?.send({
          type: "call",
          call: "c1",
          method: "approvals.request",
          params: { callId: bashCallId, tool: "Bash", args: { command: "ls" } },
        });
        break;
      case "POST /v1/sandbox/sessions/blocked":
        break;
    }
    return { ok: true, lines };
  }

  /** The answer of each JSON route the Studio's harness host calls, by its body. */
  readonly #routes: Partial<Record<AgentHostRequestRoute, (body: RouteBody) => unknown>> = {
    "GET /v1/harnesses": () => [{ id: "claude-code", name: "Claude Code" }],
    "GET /v1/sandbox/capabilities": () => ({ files: "shared", strength: "os" }),
    "GET /v1/sandbox/check": () => ({ ok: true, reason: null, missing: [] }),
    "POST /v1/sandbox/sessions/open": () => ({ session: "s1", fence: { state: "fenced" } }),
    "POST /v1/sandbox/sessions/close": () => ({}),
    "POST /v1/harnesses/detect": () => ({ status: "ready", version: "2.0.0" }),
    "POST /v1/harnesses/profile": (body) => ({
      profile: {
        workingFolder: body.workspace,
        tempFolder: "/data/tmp-1",
        settingsFolder: "/data/settings/writer",
        readOnlyPaths: [],
        deniedPaths: [],
        env: {},
        network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
        timeLimitMs: 600_000,
      },
      deniedGroups: [],
    }),
    "POST /v1/harnesses/instructions": () => ({
      folder: "/data/i-1",
      pin: { digest: pinDigest, files: { "AGENTS.md": pinDigest } },
    }),
    "POST /v1/harnesses/instructions/release": () => ({}),
    "POST /v1/proposals/start": () => ({}),
    "POST /v1/proposals/open": (body) => {
      const runId = body.run?.runId ?? "";
      this.#proposals.add(runId);
      return { folder: proposalFolderOf(runId) };
    },
    "POST /v1/proposals/folder-of": (body) => {
      const runId = body.runId ?? "";
      return { folder: this.#proposals.has(runId) ? proposalFolderOf(runId) : null };
    },
    "POST /v1/proposals/end": (body) => {
      this.#proposals.delete(body.runId ?? "");
      return {};
    },
    "POST /v1/placements/get": () => ({ placement: null }),
    "POST /v1/bridge/answer": (body) => {
      const { call, ...answer } = body;
      const given = ("result" in answer ? answer.result : { error: answer.error }) as BridgeAnswer;
      if (call === "c1") {
        this.#answered.resolve(given);
        // Claude Code goes on with the answer, and its task ends.
        this.#run?.send({
          type: "event",
          event: { type: "agent.finished", agent: "writer", output: "Done." },
        });
        this.#run?.send({ type: "finished" });
        this.#run?.end();
      } else {
        this.#phoneAnswered.resolve(given);
      }
      return {};
    },
    "POST /v1/bridge/close": () => {
      this.#bridge?.end();
      return {};
    },
    "POST /v1/harnesses/runs/cancel": () => {
      this.#run?.send({ type: "failed", message: "The run was cancelled." });
      this.#run?.end();
      return {};
    },
  };
}
