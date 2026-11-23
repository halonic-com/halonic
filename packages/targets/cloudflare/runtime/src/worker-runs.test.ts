import { runDefinitionsIndexFormat } from "@halonicjs/adapter-cloudflare-storage";
import {
  MemoryBlobStore,
  MemoryCoordination,
  MemoryRunStore,
  MemorySecrets,
} from "@halonicjs/adapter-memory";
import type { Agent, Workflow } from "@halonicjs/format";
import type {
  Clock,
  DefinitionSource,
  RunEventListener,
  ScheduledTimer,
  Scheduler,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { workerEngine, workerRuns } from "./worker-runs.ts";

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

const writer: Agent = {
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
};

/** The `acme` hub as the deployer's index has it, with only what a run reads filled in. */
const acmeHub = {
  hubId: "acme",
  workflows: { reply: replyWorkflow },
  agents: { writer },
  collections: {},
  knowledge: {},
  skills: {},
  connectors: { mail: { tools: { allow: ["search"], approve: [] } } },
  defaultModel: "fast",
  models: { fast: { provider: "mock", model: "echo", params: {}, alias: "fast", fallback: [] } },
  providers: {
    mock: {
      id: "mock",
      type: "mock",
      local: false,
      options: { script: { writer: ["Dear support, thank you."] } },
    },
  },
};

/** The deployed snapshot: its run-definitions index, or none. */
function snapshot(index: object | null): DefinitionSource {
  return {
    location: "memory:acme",
    list: async () => [],
    read: async (path) =>
      path === "run-definitions.index.json" && index !== null ? JSON.stringify(index) : null,
    version: async () => "v1",
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

/** Stand-ins for the Worker's ports, with the given index in its snapshot. */
function workerPorts(
  index: object | null = { format: runDefinitionsIndexFormat, hubs: { acme: acmeHub } },
) {
  const subscribed: string[] = [];
  return {
    clock,
    secrets: new MemorySecrets(),
    runStore: new MemoryRunStore(),
    blobs: new MemoryBlobStore(),
    scheduler: new RunObjectTimers(),
    coordination: new MemoryCoordination(clock),
    definitions: snapshot(index),
    subscribed,
    runEvents: {
      subscribe(runId: string, _afterSeq: number, _listener: RunEventListener) {
        subscribed.push(runId);
        return { close() {} };
      },
    },
  };
}

const replyStart = { hubId: "acme", workflowId: "reply", input: { from: "support" } };

verifies("runtime.worker-runs", () => {
  describe("the Worker's runs", () => {
    it("starts a workflow from the snapshot's index, and its run object gets the first timer", async () => {
      const ports = workerPorts();
      const started = await workerRuns(ports).start({ ...replyStart, runId: "run_1" });

      expect(started).toMatchObject({ id: "run_1", status: "running" });
      const events = await ports.runStore.events("run_1");
      expect(events.map((event) => event.type)).toContain("run.started");
      expect(ports.scheduler.timers.map((timer) => timer.key)).toEqual(["run_1"]);
    });

    it.each([
      ["workflow", "acme", "nothing"],
      ["hub", "globex", "reply"],
    ])(
      "refuses a %s the index doesn't have as not found, and stores no run",
      async (kind, hubId, workflowId) => {
        const ports = workerPorts();
        const error = await workerRuns(ports)
          .start({ hubId, workflowId, input: {}, runId: "run_1" })
          .catch((caught: unknown) => caught);

        expect(error).toMatchObject({ name: "RunTargetNotFound", kind });
        expect(await ports.runStore.get("run_1")).toBeNull();
      },
    );

    it("refuses a start from a snapshot with no index, saying to deploy again", async () => {
      const runs = workerRuns(workerPorts(null));
      await expect(runs.start(replyStart)).rejects.toThrow("halonic deploy");
    });

    it("cancels a running run", async () => {
      const runs = workerRuns(workerPorts());
      await runs.start({ ...replyStart, runId: "run_1" });

      expect(await runs.cancel?.("run_1")).toMatchObject({ status: "failed", reason: "cancelled" });
    });

    it("answers an agent run as not built yet, refuses a chat turn and streams from the run objects", async () => {
      const ports = workerPorts();
      const runs = workerRuns(ports);

      await expect(
        runs.startAgent({ hubId: "acme", agentId: "writer", prompt: "hi" }),
      ).rejects.toMatchObject({ name: "AgentRunsNotAvailable" });
      await expect(runs.chatTurn({ hubId: "acme", messages: [], tools: [] })).rejects.toThrow(
        "no chat turns",
      );
      runs.subscribe("run_1", 0, { onEvent() {}, onClose() {} }).close();
      expect(ports.subscribed).toEqual(["run_1"]);
    });

    it("calls the model the index names for a step's agent", async () => {
      const ports = workerPorts();
      const engine = workerEngine(ports);
      await engine.executor.start({ ...replyStart, runId: "run_1" });
      const [timer] = ports.scheduler.timers;
      if (timer !== undefined) await engine.executor.onTimer(timer);

      const run = await ports.runStore.get("run_1");
      expect(run).toMatchObject({
        status: "completed",
        context: { reply: "Dear support, thank you." },
      });
      await engine.close();
    });
  });
});
