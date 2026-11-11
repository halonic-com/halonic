import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.workflow-test-file", () => {
  it("fills in every default of a case", () => {
    const value = parsedValue(
      "workflowTest",
      yaml("workflow: invoice", "cases:", "  - name: happy path"),
    );
    expect(value).toEqual({
      version: 1,
      workflow: "invoice",
      cases: [{ name: "happy path", input: {}, mocks: {}, events: [], tools: {}, expect: {} }],
    });
  });

  it("accepts the three kinds of event", () => {
    const text = yaml(
      "workflow: approval",
      "cases:",
      "  - name: expires",
      "    events: [approve, { advance: 2d }, { event: reject, payload: { comment: Shorter } }]",
    );
    expect(parsedValue("workflowTest", text).cases[0]?.events).toEqual([
      "approve",
      { advance: "2d" },
      { event: "reject", payload: { comment: "Shorter" } },
    ]);
  });

  it("refuses a file without cases and a clock move without a unit", () => {
    expect(summary(problemsOf("workflowTest", yaml("workflow: invoice", "cases: []")))).toEqual([
      "cases too_small 2",
    ]);
    const text = yaml("workflow: invoice", "cases:", "  - name: a", "    events: [{ advance: 2 }]");
    expect(summary(problemsOf("workflowTest", text))).toEqual(["cases.0.events.0 invalid_union 4"]);
  });

  it("refuses an unknown status and an unknown expect key", () => {
    const text = yaml(
      "workflow: invoice",
      "cases:",
      "  - name: a",
      "    expect: { status: paused }",
      "  - name: b",
      "    expect: { output: x }",
    );
    expect(summary(problemsOf("workflowTest", text))).toEqual([
      "cases.0.expect.status invalid_value 4",
      "cases.1.expect unrecognized_keys 6",
    ]);
  });
});

verifies("format.workflow-test-programs", () => {
  it("leaves programs out when the case does", () => {
    const value = parsedValue("workflowTest", yaml("workflow: build", "cases:", "  - name: a"));
    expect(value.cases[0]).not.toHaveProperty("programs");
  });

  it("accepts the three kinds of program result, in order", () => {
    const text = yaml(
      "workflow: build",
      "cases:",
      "  - name: a",
      "    programs:",
      "      coder:",
      "        - Fixed the failing test.",
      "        - { output: { files: 3, passed: true } }",
      '        - { fails: "claude-code exited with code 1" }',
      "      reviewer: [{ output: null }]",
    );
    expect(parsedValue("workflowTest", text).cases[0]?.programs).toEqual({
      coder: [
        "Fixed the failing test.",
        { output: { files: 3, passed: true } },
        { fails: "claude-code exited with code 1" },
      ],
      reviewer: [{ output: null }],
    });
  });

  it("refuses an empty result, an empty or blank failure and an unknown key", () => {
    const text = yaml(
      "workflow: build",
      "cases:",
      "  - name: a",
      "    programs:",
      "      coder: [{}, { fails: '' }, { fails: '  ' }, { output: x, exitCode: 1 }]",
    );
    expect(summary(problemsOf("workflowTest", text))).toEqual([
      "cases.0.programs.coder.0 invalid_union 5",
      "cases.0.programs.coder.1.fails invalid_format 5",
      "cases.0.programs.coder.2.fails invalid_format 5",
      "cases.0.programs.coder.3 unrecognized_keys 5",
    ]);
  });
});
