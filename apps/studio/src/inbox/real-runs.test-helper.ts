import {
  ManualClock,
  MemoryBlobStore,
  MemoryRunStore,
  MemoryScheduler,
  MemorySecrets,
  ScriptedLlmProvider,
} from "@halonicjs/adapter-memory";
import { type HalonicTool, LocalExecutor } from "@halonicjs/engine";
import type { RunSummary } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import type { BlobStore, ChatRequest, ChatResponse, LlmProvider, RunStore } from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";

/**
 * Acme's reply workflow as the Inbox meets it: the writer drafts a reply
 * and may `publish` it, which needs your OK, then a person reviews the
 * reply at a `wait` step whose description core fills in.
 */
export const replyWorkflow: Workflow = {
  version: 1,
  id: "reply",
  name: "Reply to a customer",
  initial: "draft",
  context: {},
  states: {
    draft: {
      type: "task",
      agent: "writer",
      input: "Reply to {{input.from}}",
      output: "reply",
      on: [{ to: "review", event: "done" }],
    },
    review: {
      type: "wait",
      description: "Approve this reply?\n{{context.reply}}",
      on: [
        { to: "sent", event: "approve" },
        { to: "dropped", event: "reject" },
      ],
    },
    sent: { type: "final", on: [] },
    dropped: { type: "final", on: [] },
  },
  layout: {},
};

/** Starts a run of {@link replyWorkflow} in the `acme` hub. */
export const replyStart = { hubId: "acme", workflowId: "reply", input: { from: "support" } };

/** A model answer that calls `publish` once. */
export const publishCall: ChatResponse = {
  content: "",
  toolCalls: [{ id: "p-1", name: "publish", arguments: { title: "Your refund" } }],
  usage: { inputTokens: 10, outputTokens: 5 },
  finishReason: "tool_calls",
};

/** A model answer with only text. */
export function textAnswer(content: string): ChatResponse {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "stop",
  };
}

/** Where a test engine keeps its runs; share it to start the engine again on the same runs. */
export interface EngineStores {
  readonly store: RunStore;
  readonly blobs: BlobStore;
}

/** A `write` tool, so every call to it waits for your OK; `published` lists the calls that ran. */
function publishTool(published: unknown[]): HalonicTool {
  return {
    definition: {
      name: "publish",
      description: "Publishes the reply",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
    },
    risk: "write",
    run: async (args) => {
      published.push(args);
      return "published";
    },
  };
}

/** A scripted model that gives `answers` in order and keeps a copy of every request. */
function recordingModel(answers: readonly ChatResponse[]) {
  const scripted = new ScriptedLlmProvider();
  for (const answer of answers) scripted.answerNext(answer);
  const requests: ChatRequest[] = [];
  const model: LlmProvider = {
    id: scripted.id,
    type: scripted.type,
    capabilities: scripted.capabilities,
    chat: async (request) => {
      const { signal: _signal, ...sent } = request;
      requests.push(structuredClone(sent));
      return scripted.chat(request);
    },
  };
  /** The tool results the model got in its call at `index`. */
  const toolResults = (index: number) =>
    (requests[index]?.messages ?? [])
      .filter((message) => message.role === "tool")
      .map((message) => message.content);
  return { model, toolResults };
}

/**
 * The real local engine on memory ports, with a scripted model and one
 * `write` tool, `publish`. `published` lists the calls that ran.
 */
export function realEngine(
  answers: readonly ChatResponse[],
  stores: EngineStores = { store: new MemoryRunStore(), blobs: new MemoryBlobStore() },
) {
  const published: unknown[] = [];
  const { model, toolResults } = recordingModel(answers);
  const clock = new ManualClock();
  let executor: LocalExecutor | undefined;
  const scheduler = new MemoryScheduler(
    {
      onTimer: async (timer) => executor?.onTimer(timer),
      onTick: async () => {},
    },
    clock,
  );
  executor = new LocalExecutor({
    resolveModel: async () => ({ provider: model, model: "scripted-1" }),
    halonicTools: [publishTool(published)],
    connectors: [],
    secrets: new MemorySecrets(),
    clock,
    runs: {
      ...stores,
      scheduler,
      ids: fixedIds(),
      definitionsOf: async () => ({ workflow: replyWorkflow }),
    },
  });
  const engine = executor;
  /** Lets `ms` pass and delivers every timer due by then. */
  async function passTime(ms: number): Promise<void> {
    clock.advance(ms);
    await scheduler.runDue();
  }
  /** Moves the run on until it stops for a person or ends. */
  async function settle(runId: string): Promise<RunSummary> {
    for (let round = 0; round < 50; round += 1) {
      const run = await stores.store.get(runId);
      if (run !== null && run.status !== "running") return run;
      await passTime(1_000);
    }
    throw new Error(`Run ${runId} is still running after 50 rounds.`);
  }
  /** The runs that wait, as the Inbox reads them. */
  const waiting = () => stores.store.list({ status: ["waiting"] });
  return { executor: engine, stores, published, settle, passTime, waiting, toolResults };
}
