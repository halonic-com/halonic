import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";
import type { WorkflowIssue } from "./workflow-issue.ts";

// The mistakes of Nina's C340 check (HAL-14303) that the engine fails a run
// on every time: now each is an error before the run.

/** A workflow with the step `s` besides `review` and `end`, reached from the start; `topics` is in its context. */
const oneStep = (state: Record<string, unknown>) =>
  workflowOf({
    id: "w",
    name: "W",
    initial: "s",
    context: { topics: [] },
    states: {
      s: state,
      review: { type: "wait", on: [{ to: "end", event: "approve" }] },
      end: { type: "final" },
    },
  });

function found(issues: WorkflowIssue[], code: WorkflowIssue["code"]) {
  return issues
    .filter((issue) => issue.code === code)
    .map(({ message, path, severity }) => ({ severity, message, path }));
}

const foreach = (items: string) =>
  oneStep({ type: "foreach", items, agent: "writer", on: [{ to: "review" }] });

verifies("workflow.validate-foreach-items", () => {
  it("refuses items that are a text around a placeholder (C35)", () => {
    expect(
      found(validateWorkflow(foreach("Topics: {{context.topics}}")), "items-not-a-list"),
    ).toEqual([
      {
        severity: "error",
        message:
          '"s" goes through "Topics: {{context.topics}}", which is a text, not a list. Write one placeholder, such as "{{context.topics}}".',
        path: ["states", "s", "items"],
      },
    ]);
  });

  it("refuses items from a name that is neither input nor context (C35)", () => {
    expect(found(validateWorkflow(foreach("{{topics}}")), "items-not-a-list")).toEqual([
      {
        severity: "error",
        message:
          '"s" goes through {{topics}}, which gives nothing. Read the list from input or context, such as "{{context.topics}}".',
        path: ["states", "s", "items"],
      },
    ]);
  });

  it("accepts one placeholder of input or context, with or without spaces", () => {
    for (const items of ["{{input.topics}}", "{{ context.topics }}"]) {
      expect(validateWorkflow(foreach(items))).toEqual([]);
    }
  });
});

verifies("workflow.validate-done-transition", () => {
  it("refuses a task step whose transitions only take a named event (C36)", () => {
    const draft = oneStep({ agent: "writer", on: [{ to: "review", event: "finished" }] });
    expect(found(validateWorkflow(draft), "no-done-transition")).toEqual([
      {
        severity: "error",
        message:
          '"s" ends with the event done, but its transitions only take finished. Remove event: finished, or add a transition without event.',
        path: ["states", "s", "on", 0, "event"],
      },
    ]);
  });

  it("names every event of a for-each step, and says to remove their event", () => {
    const each = oneStep({
      type: "foreach",
      items: "{{context.topics}}",
      agent: "writer",
      on: [
        { to: "review", event: "approve" },
        { to: "end", event: "reject" },
      ],
    });
    expect(
      found(validateWorkflow(each), "no-done-transition").map((issue) => issue.message),
    ).toEqual([
      '"s" ends with the event done, but its transitions only take approve or reject. Remove their event, or add a transition without event.',
    ]);
  });

  it("accepts a wait step on named events, and a step with one transition on done", () => {
    const wait = oneStep({ type: "wait", on: [{ to: "end", event: "approve" }] });
    const both = oneStep({
      agent: "writer",
      on: [{ to: "review", event: "finished" }, { to: "review" }],
    });
    expect(found(validateWorkflow(wait), "no-done-transition")).toEqual([]);
    expect(found(validateWorkflow(both), "no-done-transition")).toEqual([]);
  });
});

verifies("workflow.validate", () => {
  it("refuses a task step without an agent, worded like the run's cause (C37)", () => {
    expect(
      found(validateWorkflow(oneStep({ on: [{ to: "review" }] })), "task-without-agent"),
    ).toEqual([
      {
        severity: "error",
        message:
          'Task "s" names no agent, so every run fails there. Give it an agent (agent: <id>), or make it a wait step.',
        path: ["states", "s"],
      },
    ]);
  });
});
