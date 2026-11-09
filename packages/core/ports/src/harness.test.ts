import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  Harness,
  HarnessBridge,
  HarnessEvent,
  HarnessInput,
  HarnessRun,
  HarnessTask,
} from "./harness.ts";
import type { SandboxSession } from "./sandbox.ts";

const task: HarnessTask = {
  runId: "run_1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Write short mails.",
  prompt: "Tell the team the release is out.",
};
const bridge: HarnessBridge = { url: "http://127.0.0.1:41817", token: "not-a-real-token" };
// A session like a cloud target's: it opens, but can't launch any program.
const session: SandboxSession = {
  profile: {
    workingFolder: "/data/agents/writer",
    tempFolder: "/data/tmp/run_1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: { host: "127.0.0.1", port: 41817 }, allowedSites: [] },
    timeLimitMs: 600_000,
  },
  fence: { state: "fenced" },
  start: async () => {
    throw new Error("This target can't start programs.");
  },
  onBlocked: () => () => {},
  close: async () => {},
};

/** Holds the run until a person's decision arrives through `send`. */
class Decision {
  readonly #waiting: Promise<HarnessInput>;
  #resolve: (input: HarnessInput) => void = () => {};

  constructor() {
    this.#waiting = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  arrive(input: HarnessInput): void {
    this.#resolve(input);
  }

  wait(): Promise<HarnessInput> {
    return this.#waiting;
  }
}

/**
 * The built-in agent loop cut down to the events it writes for one mail
 * that needs approval: a model call, the approval with its resume record,
 * then the tool call and the result. It ignores the session and the bridge.
 */
function builtInLoopRun(agent: string): HarnessRun {
  const decision = new Decision();
  const call = { id: "call_1", name: "gmail.send", arguments: { to: "team@acme.example" } };

  async function* events(): AsyncGenerator<HarnessEvent> {
    yield {
      type: "llm.response",
      agent,
      provider: "mock",
      model: "scripted",
      usage: { inputTokens: 120, outputTokens: 30 },
      latencyMs: 5,
      text: "",
      cost: 0.001,
    };
    yield {
      type: "approval.requested",
      agent,
      tool: call.name,
      args: call.arguments,
      callId: call.id,
      resume: { messages: [], calls: [call], step: 1 },
    };
    const input = await decision.wait();
    const approved = input.type === "approval" && input.approved;
    if (approved) {
      yield { type: "tool.called", agent, tool: call.name, args: call.arguments };
      yield { type: "tool.result", agent, tool: call.name, result: "sent" };
    }
    yield { type: "agent.finished", agent, output: approved ? "sent" : "not sent" };
  }

  return {
    [Symbol.asyncIterator]: () => events(),
    send: async (input) => decision.arrive(input),
    cancel: async () => {},
  };
}

const builtInLoop: Harness = {
  id: "halonic",
  name: "Halonic",
  detect: async () => ({ status: "ready", version: "0.1.0" }),
  start: (started) => builtInLoopRun(started.agentId),
};

verifies("ports.harness-detect", () => {
  it("gives Studio the name and the problem in one place", async () => {
    const codex: Harness = { ...builtInLoop, id: "codex", name: "Codex" };
    codex.detect = async () => ({ status: "missing" });
    const found = await codex.detect();
    expect(found.status === "missing" ? `${codex.name} isn't installed` : "").toBe(
      "Codex isn't installed",
    );
  });
});

verifies("ports.harness-control", () => {
  typeTest("starts with a task, a sandbox session and a bridge, and streams events", () => {
    expectTypeOf<Harness["start"]>().parameters.toEqualTypeOf<
      [task: HarnessTask, session: SandboxSession, bridge: HarnessBridge]
    >();
    expectTypeOf<Harness["start"]>().returns.toEqualTypeOf<HarnessRun>();
    expectTypeOf<HarnessRun>().toExtend<AsyncIterable<HarnessEvent>>();
  });

  it("needs the callId on an approval", () => {
    const approval: HarnessInput = { type: "approval", callId: "call_1", approved: true };
    // @ts-expect-error: an approval answers one request
    const unaddressed: HarnessInput = { type: "approval", approved: true };
    expect([approval, unaddressed]).toHaveLength(2);
  });

  it("fits the built-in loop, which answers an approval through send", async () => {
    const run = builtInLoop.start(task, session, bridge);
    const seen: string[] = [];
    for await (const event of run) {
      seen.push(event.type);
      if (event.type === "approval.requested") {
        expect(event.resume?.calls[0]?.id).toBe(event.callId);
        await run.send({ type: "approval", callId: event.callId, approved: true });
      }
    }
    expect(seen).toEqual([
      "llm.response",
      "approval.requested",
      "tool.called",
      "tool.result",
      "agent.finished",
    ]);
  });
});
