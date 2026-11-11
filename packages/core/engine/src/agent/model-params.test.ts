import type { Agent } from "@halonicjs/format";
import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { LocalExecutor } from "../local-executor.ts";
import { replyStart, runsOn } from "../run/local-runs-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedModel, textAnswer } from "../testing/scripted-model.ts";
import { layeredParams } from "./model-params.ts";
import { secretsWith, steppingClock } from "./turn-test-kit.test-helper.ts";

/** The `smart` alias's params in these tests. */
const smartParams = { temperature: 0.2, maxTokens: 800 };

/** The writer agent with params of its own. */
function writerWith(params: Agent["params"], more: Partial<Agent> = {}): Agent {
  return { ...writerAgent(), params, ...more };
}

/** Runs the reply workflow to its end on the given answers and setup. */
async function runReply(...args: Parameters<typeof runsOn>) {
  const setup = runsOn(...args);
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return setup;
}

verifies("engine.model-params", () => {
  describe("layeredParams", () => {
    it("lays each layer over the one before it, key by key", () => {
      expect(
        layeredParams(smartParams, { temperature: 0.7, stop: ["END"] }, { temperature: 1 }),
      ).toEqual({ temperature: 1, maxTokens: 800, stop: ["END"] });
    });

    it("keeps the value below a key a layer sets to undefined", () => {
      expect(layeredParams(smartParams, { temperature: undefined })).toEqual(smartParams);
    });

    it("replaces extra whole", () => {
      expect(layeredParams({ extra: { a: 1, b: 2 } }, { extra: { b: 3 } })).toEqual({
        extra: { b: 3 },
      });
    });

    it("gives undefined when no layer sets a key", () => {
      expect(layeredParams(undefined, {}, { maxTokens: undefined })).toBeUndefined();
    });
  });

  describe("a run's model call", () => {
    it("sends the alias's params when the agent has none", async () => {
      const { model } = await runReply([textAnswer("Dear support")], new KernelRuns(), {
        agents: { writer: writerAgent() },
        aliasParams: smartParams,
      });

      expect(model.requests[0]?.params).toEqual(smartParams);
    });

    it("sends the agent's params when the alias has none", async () => {
      const { model } = await runReply([textAnswer("Dear support")], new KernelRuns(), {
        agents: { writer: writerWith({ temperature: 0.7 }) },
      });

      expect(model.requests[0]?.params).toEqual({ temperature: 0.7 });
    });

    it("lays the agent's params over the alias's", async () => {
      const { model } = await runReply([textAnswer("Dear support")], new KernelRuns(), {
        agents: { writer: writerWith({ temperature: 0.7, stop: ["END"] }) },
        aliasParams: smartParams,
      });

      expect(model.requests[0]?.params).toEqual({
        temperature: 0.7,
        maxTokens: 800,
        stop: ["END"],
      });
    });

    it("sends no params when neither sets any", async () => {
      const { model } = await runReply([textAnswer("Dear support")], new KernelRuns(), {
        agents: { writer: writerAgent() },
      });

      expect(model.requests[0]).not.toHaveProperty("params");
    });

    it("gives a subagent's turn the subagent's own params", async () => {
      const { model } = await runReply(
        [
          callAnswer(call("d-1", "delegate_checker", { task: "Check the reply to support" })),
          textAnswer("Looks right"),
          textAnswer("Dear support"),
        ],
        new KernelRuns(),
        {
          agents: {
            writer: writerWith({ temperature: 0.7 }, { subagents: ["checker"] }),
            checker: writerWith({ temperature: 0 }, { id: "checker", name: "Checker" }),
          },
          aliasParams: smartParams,
        },
      );

      expect(model.requests.map((request) => request.params)).toEqual([
        { temperature: 0.7, maxTokens: 800 },
        { temperature: 0, maxTokens: 800 },
        { temperature: 0.7, maxTokens: 800 },
      ]);
    });
  });

  describe("a fallback", () => {
    it("gets its own alias's params under the agent's, not the first model's", async () => {
      const smart = new ScriptedModel(
        [new ModelCallError("offline", "acme-cloud can't be reached")],
        "acme-cloud",
      );
      const local = new ScriptedModel([textAnswer("From this machine")], "acme-local");
      const executor = new LocalExecutor({
        resolveModel: async () => ({
          alias: "smart",
          provider: smart,
          model: "acme-cloud-1",
          params: smartParams,
          fallback: [
            { alias: "local", provider: local, model: "acme-local-1", params: { maxTokens: 300 } },
          ],
        }),
        halonicTools: [],
        connectors: [],
        secrets: secretsWith(),
        clock: steppingClock(),
        chatAgentOf: async () => writerWith({ stop: ["END"] }),
      });

      await executor.chatTurn({ hubId: "acme", agentId: "writer", messages: [], tools: [] });

      expect(smart.requests[0]?.params).toEqual({
        temperature: 0.2,
        maxTokens: 800,
        stop: ["END"],
      });
      expect(local.requests[0]?.params).toEqual({ maxTokens: 300, stop: ["END"] });
    });
  });

  describe("a chat turn", () => {
    it("lays the request's params over the agent's and the alias's", async () => {
      const model = new ScriptedModel([textAnswer("Hello")]);
      const executor = new LocalExecutor({
        resolveModel: async () => ({ provider: model, model: "scripted-1", params: smartParams }),
        halonicTools: [],
        connectors: [],
        secrets: secretsWith(),
        clock: steppingClock(),
        chatAgentOf: async () => writerWith({ temperature: 0.7, stop: ["END"] }),
      });

      await executor.chatTurn({
        hubId: "acme",
        agentId: "writer",
        messages: [{ role: "user", content: "Hi" }],
        tools: [],
        params: { temperature: 1 },
      });

      expect(model.requests[0]?.params).toEqual({ temperature: 1, maxTokens: 800, stop: ["END"] });
    });
  });
});
