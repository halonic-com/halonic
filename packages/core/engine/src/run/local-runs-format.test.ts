import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** The reply workflow, with its `draft` step asking for JSON from the text-answering writer. */
const jsonWorkflow: Workflow = {
  ...replyWorkflow,
  states: {
    ...replyWorkflow.states,
    draft: {
      type: "task",
      agent: "writer",
      input: "Reply to {{input.from}}",
      format: "json",
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    },
  },
};

verifies("engine.step-format", () => {
  it("tells the model to reply with JSON when the step's format is json", async () => {
    const runs = new KernelRuns();
    const { executor, scheduler, model } = runsOn([textAnswer('{"to": "support"}')], runs, {
      workflow: jsonWorkflow,
      agents: { writer: writerAgent() },
    });
    await executor.start(replyStart);
    await scheduler.runDue();
    expect(model.requests[0]?.messages[0]).toEqual({
      role: "system",
      content: "Reply with JSON only.",
    });
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: { to: "support" } },
    });
  });
});
