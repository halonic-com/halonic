import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicTool } from "../agent/turn-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { memoryRecords } from "../tools/agent-memory/memory-records.test-helper.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

const saveRefunds = call("m-1", "memory_save", { title: "Refunds", text: "Ask for the order" });

/** Runs the reply workflow to its end on the given answers and setup. */
async function runReply(...args: Parameters<typeof runsOn>) {
  const setup = runsOn(...args);
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return setup;
}

/** The text of every tool message the model got in a request. */
function toolResults(request: { messages: { role: string; content: string }[] } | undefined) {
  return (request?.messages ?? []).filter((message) => message.role === "tool");
}

verifies("engine.run-tool-calls", () => {
  it("offers the agent's Halonic and memory tools, runs a call and goes on to the answer", async () => {
    const memory = memoryRecords();
    const lookup = halonicTool("lookup", async () => "found");
    const { model, runs } = await runReply(
      [callAnswer(saveRefunds), textAnswer("Dear support")],
      new KernelRuns(),
      { agents: { writer: writerAgent() }, halonicTools: [lookup], memory },
    );

    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual([
      "lookup",
      "memory_list",
      "memory_save",
      "memory_forget",
    ]);
    expect(memory.log).toHaveLength(1);
    expect(memory.log[0]?.by).toEqual({ agent: "writer", runId: "run_1" });
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("makes at most the agent's maxSteps model calls, and 6 without its file", async () => {
    const lookupForever = Array.from({ length: 8 }, (_, index) =>
      callAnswer(call(`c${index}`, "lookup")),
    );
    const lookup = halonicTool("lookup", async () => "found");
    const twice = await runReply(lookupForever, new KernelRuns(), {
      agents: { writer: { ...writerAgent(), maxSteps: 2 } },
      halonicTools: [lookup],
    });
    const byDefault = await runReply(lookupForever, new KernelRuns(), { halonicTools: [lookup] });

    expect(twice.model.requests).toHaveLength(2);
    expect(byDefault.model.requests).toHaveLength(6);
  });

  it("refuses a call with an argument its tool doesn't declare, as the call's result", async () => {
    const memory = memoryRecords();
    const misaddressed = call("m-1", "memory_save", { title: "Refunds", text: "Ask", to: "all" });
    const { model } = await runReply(
      [callAnswer(misaddressed), textAnswer("Dear support")],
      new KernelRuns(),
      { memory },
    );

    expect(memory.log).toEqual([]);
    expect(toolResults(model.requests[1])).toEqual([
      expect.objectContaining({
        toolCallId: "m-1",
        content: 'Refused: memory_save has no parameter "to"',
      }),
    ]);
  });
});
