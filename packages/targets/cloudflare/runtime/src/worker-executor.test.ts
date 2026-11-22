import {
  MemoryBlobStore,
  MemoryCoordination,
  MemoryRunStore,
  MemorySecrets,
  ScriptedLlmProvider,
} from "@halonicjs/adapter-memory";
import type { RunDefinitions } from "@halonicjs/engine";
import type { Agent, Workflow } from "@halonicjs/format";
import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { workerExecutor } from "./worker-executor.ts";

const clock: Clock = { now: () => new Date("2026-11-22T09:00:00.000Z") };

const replyWorkflow: Workflow = {
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
      on: [{ to: "sent", event: "done" }],
    },
    sent: { type: "final", on: [] },
  },
  layout: {},
};

/** The workflow's `writer` agent, with every default filled in, in `harness` when given. */
function writerAgent(harness?: Agent["harness"]): Agent {
  return {
    version: 1,
    id: "writer",
    name: "Writer",
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
    ...(harness === undefined ? {} : { harness }),
  };
}

/** Stands in for the run objects' scheduler: it keeps the timers a run object's alarm would deliver. */
class RunObjectTimers implements Scheduler {
  readonly timers: ScheduledTimer[] = [];

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.timers.push({ key, timerId, at });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    const index = this.timers.findIndex((t) => t.key === key && t.timerId === timerId);
    if (index >= 0) this.timers.splice(index, 1);
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return this.timers.filter((timer) => timer.key === key);
  }
}

/** The Worker's engine on stand-in ports, with a scripted model and the given agents. */
function setUp(agents: Record<string, Agent>) {
  const ports = {
    clock,
    secrets: new MemorySecrets(),
    runStore: new MemoryRunStore(),
    blobs: new MemoryBlobStore(),
    scheduler: new RunObjectTimers(),
    coordination: new MemoryCoordination(clock),
  };
  const model = new ScriptedLlmProvider();
  const definitions: RunDefinitions = { workflow: replyWorkflow, agents };
  const engine = workerExecutor(ports, {
    definitionsOf: async () => definitions,
    resolveModel: async () => ({ provider: model, model: "scripted", local: true }),
    ids: fixedIds(),
  });
  return { engine, model, ports };
}

const replyStart = { hubId: "acme", workflowId: "reply", input: { from: "support" } };

async function eventTypes(ports: ReturnType<typeof setUp>["ports"], runId: string) {
  return (await ports.runStore.events(runId)).map((event) => event.type);
}

verifies("runtime.worker-executor", () => {
  describe("the Worker's engine", () => {
    it("starts a plain workflow, and its first step's events land in the run store", async () => {
      const { engine, model, ports } = setUp({ writer: writerAgent() });
      model.answerNext({
        content: "Dear support",
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason: "stop",
      });

      const started = await engine.executor.start(replyStart);

      expect(started.status).toBe("running");
      expect(await eventTypes(ports, started.id)).toContain("run.started");
      const [timer] = ports.scheduler.timers;
      expect(timer?.key).toBe(started.id);
      // What the run object's alarm does with its due timer.
      if (timer !== undefined) await engine.executor.onTimer(timer);

      const types = await eventTypes(ports, started.id);
      expect(types).toContain("llm.response");
      expect(types.at(-1)).toBe("run.completed");
      await engine.close();
    });

    it("refuses a harness agent's step with a clear error, before any model is called", async () => {
      const { engine, model, ports } = setUp({ writer: writerAgent("claude-code") });

      const started = await engine.executor.start(replyStart);

      expect(started).toMatchObject({ status: "failed", reason: "harness-unavailable" });
      expect(started.error).toContain("run-harness");
      expect((await eventTypes(ports, started.id)).at(-1)).toBe("run.failed");
      expect(ports.scheduler.timers).toEqual([]);
      expect(model.calls().started).toBe(0);
      await engine.close();
    });
  });
});
