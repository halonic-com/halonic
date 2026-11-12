import type { Agent, Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

/** A clerk that answers in text and has a method that answers with fields. */
const clerk: Agent = {
  ...writerAgent(),
  id: "clerk",
  name: "Clerk",
  methods: {
    extract: {
      input: ["invoice"],
      instructions: "Extract the vendor from: {{invoice}}",
      output: { vendor: "string" },
    },
  },
};

/** A checker whose own output is JSON. */
const checker: Agent = {
  ...writerAgent(),
  id: "checker",
  name: "Checker",
  output: { type: "json" },
};

function workflowWith(step: WorkflowState): Workflow {
  return {
    version: 1,
    id: "invoice",
    name: "Invoice",
    initial: "read",
    context: {},
    states: { read: step, done: { type: "final", on: [] } },
    layout: {},
  };
}

function taskStep(agent: string, keys: Partial<WorkflowState>): WorkflowState {
  return { type: "task", agent, output: "reply", on: [{ to: "done", event: "done" }], ...keys };
}

const start = { ...startInput("sha-1"), workflowId: "invoice", input: { invoice: "Acme Paper" } };

/** The run after the step's agent answers `reply`. */
function answered(step: WorkflowState, reply: string) {
  return play(workflowWith(step), [start, answer("call-1", reply)], { clerk, checker }).run;
}

verifies("engine.step-format", () => {
  it("reads the answer as JSON when the step's format is json and its agent answers in text", () => {
    const run = answered(taskStep("clerk", { format: "json" }), '```json\n{"ok": true}\n```');
    expect(run?.context["reply"]).toEqual({ ok: true });
  });

  it("keeps the answer as text when the step's format is text and its agent answers JSON", () => {
    const run = answered(taskStep("checker", { format: "text" }), "Looks fine.");
    expect(run?.status).toBe("completed");
    expect(run?.context["reply"]).toBe("Looks fine.");
  });

  it("puts the step's format before the method's output", () => {
    const step = taskStep("clerk", {
      method: "extract",
      with: { invoice: "{{input.invoice}}" },
      format: "text",
    });
    const run = answered(step, "Vendor: Acme Paper");
    expect(run?.context["reply"]).toBe("Vendor: Acme Paper");
  });

  it("fails the run when the step's format is json and the answer isn't JSON", () => {
    const run = answered(taskStep("clerk", { format: "json" }), "Looks fine.");
    expect(run?.status).toBe("failed");
  });
});
