import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";

/** A workflow whose first step is `match`, written as given, then the end. */
const file = (match: Record<string, unknown>) => ({
  id: "watch",
  name: "Watch",
  initial: "match",
  context: { prs: [] },
  states: { match: { on: [{ to: "end" }], ...match }, end: { type: "final" } },
});

const rule = {
  type: "rule",
  rule: "rules/match.rule.js",
  input: { prs: "{{context.prs}}" },
  output: "decisions",
};

const codesOf = (match: Record<string, unknown>) =>
  validateWorkflow(workflowOf(file(match))).map(({ severity, code }) => `${severity} ${code}`);

verifies("workflow.rule-step", () => {
  it("takes a rule step with its file, input and output", () => {
    expect(codesOf(rule)).toEqual([]);
  });

  it("refuses a rule step with no file or no output, naming the fix", () => {
    const issues = validateWorkflow(workflowOf(file({ type: "rule" })));
    expect(issues.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: "rule-without-file",
        message:
          'Rule "match" names no file, so every run fails there. Give it one (rule: rules/<name>.rule.js).',
      },
      {
        code: "rule-without-output",
        message:
          'Rule "match" has no output, so its result goes nowhere. Name the context key it writes (output: <key>).',
      },
    ]);
  });

  it("refuses a rule file outside the hub", () => {
    for (const path of ["../secrets.rule.js", "/etc/passwd", "rules/../../x.rule.js"]) {
      const parsed = parseFile("workflow", JSON.stringify(file({ ...rule, rule: path })));
      expect(parsed.ok, path).toBe(false);
    }
  });

  it("warns about a key a rule step doesn't use", () => {
    expect(codesOf({ ...rule, agent: "writer" })).toEqual(["warning ignored-key"]);
  });
});
