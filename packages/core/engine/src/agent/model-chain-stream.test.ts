import {
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  ModelCallError,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  ScriptedModel,
  textAnswer,
} from "../testing/scripted-model.ts";
import { reviewedTools } from "./listed-tool-approval.test-helper.ts";
import type { ResolvedModel } from "./model-chain.ts";
import { runModelTurn } from "./run-model-turn.ts";
import {
  MemoryTurnLog,
  runEveryCall,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";

/** A model alias on a scripted provider; its model is named after the provider. */
function alias(name: string, provider: ScriptedModel, more: Partial<ResolvedModel> = {}) {
  return { alias: name, provider, model: `${provider.id}-1`, ...more };
}

const offline = () => new ModelCallError("offline", "acme-cloud can't be reached");

function runTurnOn(
  model: ResolvedModel,
  setup: { log?: MemoryTurnLog; connectors?: ScriptedConnector[] } = {},
) {
  return runModelTurn({
    model,
    secrets: secretsWith(),
    messages: [{ role: "user", content: "Find the Acme invoice" }],
    callerTools: [],
    halonicTools: [],
    connectors: setup.connectors ?? [],
    listedToolApproval: reviewedTools,
    maxRounds: 20,
    agent: "clerk",
    clock: steppingClock(),
    checkCall: runEveryCall,
    ...(setup.log === undefined ? {} : { log: setup.log }),
  });
}

/** A provider that streams: each answer is its pieces, then an error or the end, or the failure at once. */
class StreamingModel extends ScriptedModel {
  override readonly capabilities = {
    tools: true,
    jsonOutput: false,
    vision: false,
    streaming: true,
  };
  readonly streamed: ChatRequest[] = [];
  private readonly streams: (ChatStreamEvent[] | Error)[];
  private readonly failAfterPieces: Error | undefined;

  constructor(streams: (ChatStreamEvent[] | Error)[], id: string, failAfterPieces?: Error) {
    super([], id);
    this.streams = [...streams];
    this.failAfterPieces = failAfterPieces;
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    this.streamed.push(request);
    const next = this.streams.shift();
    if (next instanceof Error) {
      throw next;
    }
    for (const event of next ?? []) {
      yield event;
    }
    if (this.failAfterPieces !== undefined) {
      throw this.failAfterPieces;
    }
  }
}

const streamed = (response: ChatResponse): ChatStreamEvent[] => [
  { type: "text", delta: response.content.slice(0, 3) },
  { type: "text", delta: response.content.slice(3) },
  { type: "done", response },
];

verifies("engine.model-calls-stream", () => {
  it("answers with the done response of a stream, never calling chat()", async () => {
    const answer = {
      ...callAnswer(call("c1", "search", { q: "Acme" })),
      reasoning: "look it up",
      usage: { inputTokens: 7, outputTokens: 3 },
    };
    const first = new StreamingModel(
      [streamed(answer), streamed(textAnswer("Found it"))],
      "acme-local",
    );

    const connector = new ScriptedConnector("acme", [listedTool("search")], () => "ok");

    const result = await runTurnOn(alias("local", first), {
      connectors: [connector],
    });

    expect(result.content).toBe("Found it");
    expect(first.streamed).toHaveLength(2);
    expect(first.requests).toEqual([]);
    expect(connector.calls).toEqual([{ name: "search", args: { q: "Acme" } }]);
  });

  it("moves on when a stream fails after some pieces, and the pieces leave nothing behind", async () => {
    const local = new StreamingModel([streamed(textAnswer("Partial"))], "acme-local", offline());
    const cloud = new ScriptedModel([textAnswer("From the cloud")], "acme-cloud");
    const log = new MemoryTurnLog();

    const result = await runTurnOn(alias("local", local, { fallback: [alias("smart", cloud)] }), {
      log,
    });

    expect(result.content).toBe("From the cloud");
    expect(log.events.map((event) => event.type)).toContain("llm.fallback");
  });

  it("moves on when a stream fails before its first piece", async () => {
    const local = new StreamingModel(
      [new ModelCallError("timeout", "no first answer")],
      "acme-local",
    );
    const cloud = new ScriptedModel([textAnswer("From the cloud")], "acme-cloud");

    const result = await runTurnOn(alias("local", local, { fallback: [alias("smart", cloud)] }));

    expect(result.content).toBe("From the cloud");
  });

  it("fails as refused when a stream ends without done", async () => {
    const local = new StreamingModel([[{ type: "text", delta: "Half" }]], "acme-local");

    await expect(runTurnOn(alias("local", local))).rejects.toMatchObject({ reason: "refused" });
  });

  it("fails as refused when a stream goes on after done", async () => {
    const local = new StreamingModel(
      [[...streamed(textAnswer("Done")), { type: "text", delta: "more" }]],
      "acme-local",
    );

    await expect(runTurnOn(alias("local", local))).rejects.toMatchObject({ reason: "refused" });
  });
});
