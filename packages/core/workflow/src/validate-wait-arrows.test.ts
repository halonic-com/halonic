import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";

/** A workflow whose first step `check` has these transitions, each to a final step. */
function checkStep(type: "wait" | "task", on: Record<string, unknown>[]) {
  return workflowOf({
    id: "w",
    name: "W",
    initial: "check",
    states: {
      check: type === "wait" ? { type, on } : { type, agent: "a", on },
      send: { type: "final" },
      draft: { type: "final" },
      stop: { type: "final" },
    },
  });
}

/** The codes of the wait checks the workflow gets. */
function waitCodes(workflow: ReturnType<typeof checkStep>): string[] {
  return validateWorkflow(workflow)
    .map((found) => found.code)
    .filter((code) => code === "wait-arrow-without-event" || code === "wait-without-events");
}

verifies("workflow.validate-wait-arrow-event", () => {
  it("warns at a wait's transition without event when the wait also has named events", () => {
    const workflow = checkStep("wait", [
      { to: "send", event: "approve" },
      { to: "stop", event: "reject" },
      { to: "draft" },
    ]);
    const found = validateWorkflow(workflow).filter(
      (issue) => issue.code === "wait-arrow-without-event" || issue.code === "wait-without-events",
    );
    expect(found).toEqual([
      {
        severity: "warning",
        code: "wait-arrow-without-event",
        message:
          'In "check", the transition to "draft" has no event, so a person must answer "done" to take it. Name the answer it is for, like "reject", or give it a timer',
        path: ["states", "check", "on", 2],
        state: "check",
      },
    ]);
  });

  it("leaves a timer next to a named event alone", () => {
    const workflow = checkStep("wait", [
      { to: "send", event: "approve" },
      { to: "stop", after: "1h" },
    ]);
    expect(waitCodes(workflow)).toEqual([]);
  });

  it("gives a wait with no named events only the step's own warning", () => {
    const workflow = checkStep("wait", [{ to: "send" }]);
    expect(waitCodes(workflow)).toEqual(["wait-without-events"]);
  });

  it("leaves a task's transition without event alone", () => {
    const workflow = checkStep("task", [{ to: "send", event: "finished" }, { to: "draft" }]);
    expect(waitCodes(workflow)).toEqual([]);
  });
});
