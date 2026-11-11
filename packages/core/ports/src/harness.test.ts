import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  addHarnessEnvironment,
  type Harness,
  type HarnessBridge,
  type HarnessEvent,
  type HarnessInput,
  type HarnessRun,
  type HarnessTask,
  harnessBridgeTokenHeader,
} from "./harness.ts";
import type { SandboxProfile, SandboxSession } from "./sandbox.ts";

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

verifies("ports.harness-detect-folder", () => {
  it("answers for the agent whose settings folder it is given", async () => {
    const signedInFolders = new Set(["/person-home/.claude"]);
    const claudeCode: Harness = {
      ...builtInLoop,
      id: "claude-code",
      name: "Claude Code",
      detect: async ({ settingsFolder = "/person-home/.claude" } = {}) =>
        signedInFolders.has(settingsFolder)
          ? { status: "ready", version: "2.1.321" }
          : { status: "signed-out", version: "2.1.321" },
    };
    expect(await claudeCode.detect()).toEqual({ status: "ready", version: "2.1.321" });
    expect(await claudeCode.detect({ settingsFolder: "/halonic-data/settings/writer" })).toEqual({
      status: "signed-out",
      version: "2.1.321",
    });
  });

  typeTest("takes the folder as an optional option", () => {
    expectTypeOf<Harness["detect"]>().toBeCallableWith();
    expectTypeOf<Harness["detect"]>().toBeCallableWith({ settingsFolder: "/x" });
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

verifies("ports.harness-environment", () => {
  const engineEnv = { HOME: "/data/agents/writer", PATH: "/usr/bin" };

  it("adds the variables a harness's program needs", () => {
    const claudeCode: Harness = {
      ...builtInLoop,
      id: "claude-code",
      environment: (started, folders) => ({
        ANTHROPIC_BASE_URL: started.url,
        CLAUDE_CODE_TMPDIR: folders.tempFolder,
      }),
    };
    const added = claudeCode.environment?.(bridge, session.profile) ?? {};
    expect(addHarnessEnvironment(engineEnv, added)).toEqual({
      ...engineEnv,
      ANTHROPIC_BASE_URL: "http://127.0.0.1:41817",
      CLAUDE_CODE_TMPDIR: "/data/tmp/run_1",
    });
  });

  it("refuses a name the engine set, in any case, and names it without its value", () => {
    const clashing = { Path: "/agent/bin", RUN_TOKEN: bridge.token };
    let message = "";
    try {
      addHarnessEnvironment({ ...engineEnv, RUN_TOKEN: "set-by-the-engine" }, clashing);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "The harness sets environment variables Halonic already sets: Path, RUN_TOKEN",
    );
    expect(message).not.toContain(bridge.token);
  });

  it("refuses two names from the harness that differ only in case", () => {
    const twice = { PATH: "/agent/bin", Path: bridge.token };
    expect(() => addHarnessEnvironment({ HOME: "/data/agents/writer" }, twice)).toThrow(
      "The harness sets environment variables that differ only in case: Path",
    );
  });

  typeTest("is optional, so the built-in loop fits without it", () => {
    expectTypeOf<Pick<Harness, "id" | "name" | "detect" | "start">>().toExtend<Harness>();
    expectTypeOf<NonNullable<Harness["environment"]>>().parameters.toEqualTypeOf<
      [
        bridge: HarnessBridge,
        folders: Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder">,
      ]
    >();
  });

  it("sends the token in its own header", () => {
    expect(harnessBridgeTokenHeader).toBe("x-halonic-run-token");
  });
});
