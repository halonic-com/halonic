/**
 * The Worker's run object moves a run on from its alarm, inside workerd (HAL-13210, part c). Run
 * by `run-driving.test.ts`.
 */

import { env } from "cloudflare:workers";
import { type IndexedHubs, writeDefinitionSnapshot } from "@halonicjs/adapter-cloudflare-storage";
import { ScriptedLlmProvider } from "@halonicjs/adapter-memory";
import type { AssembledEngine } from "@halonicjs/engine";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import { indexedRunDefinitions } from "../indexed-run-definitions.ts";
import { createRuntime, type Runtime } from "../runtime.ts";
import { workerExecutor } from "../worker-executor.ts";
import { workerEngine } from "../worker-runs.ts";

export { CoordinationObject, RoutinesObject } from "../index.ts";

// Test values made up for this file; the key is 32 bytes in base64url.
const testSecrets = {
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

const configured = { ...(env as unknown as RuntimeEnv), ...testSecrets };

/**
 * The Worker's run object, with the test's secrets in its `env` as `wrangler secret` would put
 * them there, its alarm callable so the spec needn't wait for the platform's, and a scripted
 * model in its engine, since the Worker can't call a real one yet.
 */
export class AlarmRunObject extends RunObject {
  constructor(ctx: DurableObjectState, objectEnv: Cloudflare.Env) {
    super(ctx, { ...objectEnv, ...testSecrets } as Cloudflare.Env);
  }

  async runAlarm(): Promise<void> {
    await this.alarm();
  }

  protected override engineOf(runtime: Runtime): AssembledEngine {
    const model = new ScriptedLlmProvider();
    model.answerNext({
      content: "The order is on its way.",
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    });
    return workerExecutor(runtime, {
      definitionsOf: indexedRunDefinitions(runtime.definitions),
      resolveModel: async () => ({ provider: model, model: "scripted", local: true }),
    });
  }
}

/**
 * The `acme` hub as the deployer's run-definitions index has it: a workflow whose first step asks
 * the `writer` agent's model, which only a timer, so the run object's alarm, sets off.
 */
const acmeDefinitions = {
  acme: {
    hubId: "acme",
    workflows: {
      "handle-order": {
        version: 1,
        id: "handle-order",
        name: "Handle an order",
        initial: "reply",
        context: {},
        states: {
          reply: {
            type: "task",
            agent: "writer",
            input: "Reply to the customer",
            output: "reply",
            on: [{ to: "done", event: "done" }],
          },
          done: { type: "final", on: [] },
        },
        layout: {},
      },
    },
    agents: {
      writer: {
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
      },
    },
    collections: {},
    knowledge: {},
    skills: {},
    connectors: {},
  },
} as unknown as IndexedHubs;

describe("the Worker's run object", () => {
  it("moves a started run on to run.completed at its alarm, and puts it in the run list", async () => {
    // The run object builds its engine unscoped, from `env`, so this snapshot is unscoped too.
    await writeDefinitionSnapshot(
      configured.DEFINITIONS as unknown as Parameters<typeof writeDefinitionSnapshot>[0],
      {},
      { routines: [], runDefinitions: acmeDefinitions },
    );
    const runtime = await createRuntime(configured);
    const { id: runId } = await workerEngine(runtime).executor.start({
      hubId: "acme",
      workflowId: "handle-order",
      input: {},
    });
    expect(await runtime.scheduler.pending(runId)).not.toEqual([]);

    const { RUN } = env as unknown as { RUN: DurableObjectNamespace<AlarmRunObject> };
    await RUN.get(RUN.idFromName(runId)).runAlarm();

    const types = (await runtime.runStore.events(runId)).map((event) => event.type);
    expect(types).toContain("llm.response");
    expect(types.at(-1)).toBe("run.completed");
    expect(await runtime.scheduler.pending(runId)).toEqual([]);
    // The run list may lag the log by an alarm; the object sets its alarm again for the update.
    await RUN.get(RUN.idFromName(runId)).runAlarm();
    const listed = (await runtime.runStore.list()).find((run) => run.id === runId);
    expect(listed).toMatchObject({ status: "completed" });
  });
});
