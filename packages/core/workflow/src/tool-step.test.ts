import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";

/** A workflow whose first step is `merge`, written as given, then the end. */
const file = (merge: Record<string, unknown>) => ({
  id: "watch",
  name: "Watch",
  initial: "merge",
  context: { decisions: { merge: 7 } },
  states: { merge: { on: [{ to: "end" }], ...merge }, end: { type: "final" } },
});

const tool = {
  type: "tool",
  connector: "github",
  tool: "merge_pull_request",
  with: { pr: "{{context.decisions.merge}}" },
  output: "merged",
};

const codesOf = (merge: Record<string, unknown>) =>
  validateWorkflow(workflowOf(file(merge))).map(({ severity, code }) => `${severity} ${code}`);

verifies("workflow.tool-step", () => {
  it("takes a tool step with its connector, tool, arguments and output", () => {
    expect(codesOf(tool)).toEqual([]);
  });

  it("refuses a tool step with no connector, tool or output, naming the fix", () => {
    const issues = validateWorkflow(workflowOf(file({ type: "tool" })));
    expect(issues.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: "tool-without-connector",
        message:
          'Tool step "merge" names no connector, so every run fails there. Name the connector whose tool it calls (connector: <id>).',
      },
      {
        code: "tool-without-name",
        message:
          'Tool step "merge" names no tool, so every run fails there. Name the tool as its server lists it (tool: <name>).',
      },
      {
        code: "tool-without-output",
        message:
          'Tool step "merge" has no output, so its result goes nowhere. Name the context key it writes (output: <key>).',
      },
    ]);
  });

  it("warns about a key a tool step doesn't use", () => {
    expect(codesOf({ ...tool, agent: "writer" })).toEqual(["warning ignored-key"]);
  });
});
