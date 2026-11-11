import type { ChatResponse } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Subscribes to `run_1` from its first event, and gives the types of the events it gets. */
function follow(executor: ReturnType<typeof runsOn>["executor"]): string[] {
  const types: string[] = [];
  executor.subscribe("run_1", 0, { onEvent: (event) => types.push(event.type), onClose: () => {} });
  return types;
}

verifies("engine.local-run-subscribe", () => {
  it("streams the events a harness call appends while the call still runs", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const { executor, scheduler } = runsOn([], new KernelRuns(), {
      agents: { writer: writerAgent("claude-code") },
      harnesses: ports.options,
    });
    await executor.start(replyStart);
    const types = follow(executor);

    const harnessCall = scheduler.deliver("run_1", "harness:call-1");

    await vi.waitFor(() => expect(types).toContain("harness.started"));
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("streams a tool call a turn refused while the turn still runs", async () => {
    const { executor, model, scheduler } = runsOn([callAnswer(call("t-1", "delete_all", {}))]);
    const secondAnswer = Promise.withResolvers<ChatResponse>();
    const chat = model.chat.bind(model);
    model.chat = (request) => (model.requests.length === 0 ? chat(request) : secondAnswer.promise);
    await executor.start(replyStart);
    const types = follow(executor);

    const modelCall = scheduler.deliver("run_1", "call:call-1");

    await vi.waitFor(() => expect(types).toContain("tool.refused"));
    secondAnswer.resolve(textAnswer("Dear support"));
    await modelCall;
  });
});
