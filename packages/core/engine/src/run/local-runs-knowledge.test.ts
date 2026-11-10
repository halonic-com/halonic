import { fenceUntrusted } from "@halonicjs/app";
import type { Agent } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicTool } from "../agent/turn-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import {
  FakeSource,
  fakeKnowledge,
  hit,
  sourceFile,
} from "../knowledge/knowledge-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { type RunsSetup, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** The writer with the given knowledge sources. */
function writerWith(knowledge: string[]): Agent {
  return { ...writerAgent(), knowledge };
}

/** Runs the reply workflow on the given answers, with the writer's knowledge set up. */
async function runReply(answers: Parameters<typeof runsOn>[0], setup: RunsSetup) {
  const started = runsOn(answers, new KernelRuns(), setup);
  await started.executor.start(replyStart);
  await started.scheduler.runDue();
  return started;
}

verifies("engine.agent-knowledge", () => {
  it("builds the sources a run's agent lists from the run's kept definitions", async () => {
    const handbook = new FakeSource("handbook", []);
    const { options, built } = fakeKnowledge([handbook]);

    await runReply([textAnswer("Dear support")], {
      agents: { writer: writerWith(["handbook"]) },
      knowledge: { handbook: sourceFile("handbook") },
      knowledgeOptions: options,
    });

    expect(built).toEqual([
      { id: "handbook", config: { name: "handbook" }, basePath: "hubs/acme" },
    ]);
  });

  it("builds no source for a run kept without knowledge", async () => {
    const { options, built } = fakeKnowledge([new FakeSource("handbook", [])]);

    const { runs } = await runReply([textAnswer("Dear support")], {
      agents: { writer: writerWith(["handbook"]) },
      knowledgeOptions: options,
    });

    expect(built).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("fails the run's call when no factory builds a source's type", async () => {
    const { options } = fakeKnowledge([]);

    const { runs } = await runReply([textAnswer("Dear support")], {
      agents: { writer: writerWith(["handbook"]) },
      knowledge: { handbook: sourceFile("handbook", { provider: "vector" }) },
      knowledgeOptions: options,
    });

    expect(await runs.get("run_1")).toMatchObject({ status: "failed" });
  });
});

verifies("engine.knowledge-auto", () => {
  it("puts an auto source's passages, fenced, into the run's first model request", async () => {
    const handbook = new FakeSource("handbook", [hit("refunds.md", "Refund within 30 days")]);
    const { options } = fakeKnowledge([handbook]);

    const { model } = await runReply([textAnswer("Dear support")], {
      agents: { writer: writerWith(["handbook"]) },
      knowledge: { handbook: sourceFile("handbook", { mode: "auto" }) },
      knowledgeOptions: options,
    });

    const prompt = model.requests[0]?.messages[0]?.content ?? "";
    expect(handbook.queries).toHaveLength(1);
    expect(handbook.queries[0]?.query).toBe(prompt.split("\n\n")[0]);
    expect(prompt).toContain(fenceUntrusted("Refund within 30 days"));
  });

  it("searches nothing before the first call for a source in `tools` mode", async () => {
    const handbook = new FakeSource("handbook", [hit("refunds.md")]);
    const { options } = fakeKnowledge([handbook]);

    await runReply([textAnswer("Dear support")], {
      agents: { writer: writerWith(["handbook"]) },
      knowledge: { handbook: sourceFile("handbook") },
      knowledgeOptions: options,
    });

    expect(handbook.queries).toEqual([]);
  });

  it("doesn't search again when the turn goes on after a person's OK", async () => {
    const handbook = new FakeSource("handbook", [hit("refunds.md")]);
    const { options } = fakeKnowledge([handbook]);
    const publish = { ...halonicTool("publish", async () => "published"), risk: "write" as const };
    const setup = await runReply([callAnswer(call("p-1", "publish")), textAnswer("Posted")], {
      agents: { writer: writerWith(["handbook"]) },
      knowledge: { handbook: sourceFile("handbook", { mode: "auto" }) },
      knowledgeOptions: options,
      halonicTools: [publish],
    });

    await setup.executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await setup.scheduler.runDue();

    expect(handbook.queries).toHaveLength(1);
    expect(setup.model.requests[1]?.messages[0]).toEqual(setup.model.requests[0]?.messages[0]);
    expect(await setup.runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
